import express from 'express';
import multer from 'multer';
import { processFeedback, processSuggestedReplies, processTextMessage } from '../services/conversationService';
import { generateTTS } from '../services/ttsService';
import { SUPABASE_STORAGE_BUCKET, supabase, MOCK_USER_ID } from '../services/supabase';
import { generateResponse } from '../services/llmService';
import {
  deleteConversationById,
  deleteMessagesByConversation,
  getConversation,
  insertMessages,
  listConversations,
  listMessages,
  updateMessage,
  upsertConversation,
} from '../services/conversationDb';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

function sseWrite(res: any, event: string, data: any) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

router.post('/message/stream', async (req, res) => {
  // SSE headers
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // If behind a proxy (nginx), this disables buffering
  res.setHeader('X-Accel-Buffering', 'no');
  // Flush headers immediately
  // @ts-ignore
  res.flushHeaders?.();

  const t0 = Date.now();
  try {
    const {
      text,
      sessionId,
      conversationHistory,
      userMessageId,
      aiMessageId,
      isSuggestedReply,
      userCreatedAt,
      aiCreatedAt,
    } = req.body || {};

    const conversationId = sessionId;
    if (!conversationId || typeof conversationId !== 'string') {
      sseWrite(res, 'error', { error: 'sessionId(conversationId) is required.' });
      return res.end();
    }
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      sseWrite(res, 'error', { error: 'text is required.' });
      return res.end();
    }
    if (!userMessageId || !aiMessageId) {
      sseWrite(res, 'error', { error: 'userMessageId and aiMessageId are required.' });
      return res.end();
    }

    // Start LLM ASAP (for first token latency). DB writes can happen in background.
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const history: Array<{ role: 'user' | 'assistant'; content: string }> = Array.isArray(conversationHistory)
      ? conversationHistory
      : [];

    // Keep-alive pings
    const ping = setInterval(() => {
      try {
        res.write(`: ping ${Date.now()}\n\n`);
      } catch {
        // ignore
      }
    }, 15000);

    let clientClosed = false;
    req.on('close', () => {
      clientClosed = true;
      clearInterval(ping);
    });

    // Background DB upserts/inserts (do not block first token)
    const tDb0 = Date.now();
    let titleToSet = 'Conversation';
    setImmediate(async () => {
      try {
        const existingConv = await getConversation(conversationId, MOCK_USER_ID);
        titleToSet = existingConv?.title ? existingConv.title : text.trim().substring(0, 50);
        await upsertConversation({
          id: conversationId,
          user_id: MOCK_USER_ID,
          title: titleToSet,
          last_message: text.trim(),
          last_message_at: userCreatedAt || new Date().toISOString(),
        });

        await insertMessages([
          {
            id: userMessageId,
            conversation_id: conversationId,
            user_id: MOCK_USER_ID,
            type: 'user',
            transcription: text.trim(),
            ai_response_text: null,
            corrected_text: null,
            explanation: null,
            user_audio_url: null,
            ai_audio_url: null,
            is_suggested_reply: !!isSuggestedReply,
            created_at: userCreatedAt || new Date().toISOString(),
          },
          {
            id: aiMessageId,
            conversation_id: conversationId,
            user_id: MOCK_USER_ID,
            type: 'ai',
            transcription: null,
            ai_response_text: '',
            corrected_text: null,
            explanation: null,
            user_audio_url: null,
            ai_audio_url: null,
            is_suggested_reply: false,
            created_at: aiCreatedAt || new Date().toISOString(),
          },
        ]);
      } catch (e) {
        console.warn('DB init failed (stream route, non-fatal for streaming):', e);
      }
    });
    const tDb1 = Date.now();

    // If no key, fall back to non-stream generation (rule-based inside generateResponse)
    if (!openaiApiKey) {
      const tLlm0 = Date.now();
      const full = await generateResponse(text.trim(), undefined, history);
      const tLlm1 = Date.now();
      try {
        await updateMessage(conversationId, aiMessageId, { ai_response_text: full });
        await upsertConversation({
          id: conversationId,
          user_id: MOCK_USER_ID,
          title: titleToSet || 'Conversation',
          last_message: full,
          last_message_at: aiCreatedAt || new Date(Date.now() + 1).toISOString(),
        });
      } catch (e) {
        console.warn('Failed to persist fallback final text (non-fatal):', e);
      }
      if (!clientClosed) {
        sseWrite(res, 'delta', { delta: full });
        sseWrite(res, 'meta', {
          timings: {
            total_ms: Date.now() - t0,
            db_ms: tDb1 - tDb0,
            llm_ms: tLlm1 - tLlm0,
          },
        });
        sseWrite(res, 'done', { text: full });
      }
      clearInterval(ping);
      return res.end();
    }

    // Build messages array with system prompt + history + current user message
    const systemPrompt =
      `You are a friendly English conversation partner. Respond naturally to what the user says, ` +
      `as if you're having a casual conversation. Keep responses concise (1-2 sentences). ` +
      `Adjust your language level based on the user's English proficiency. Remember the context.`;

    const msgs: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];
    // Cost+latency: less context helps. Keep last 6 turns.
    history.slice(-6).forEach((m) => {
      msgs.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content });
    });
    msgs.push({ role: 'user', content: text.trim() });

    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const tLlm0 = Date.now();
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: msgs,
      temperature: 0.7,
      // Keep it short for latency (Engoo-like snappy feel)
      max_tokens: 90,
      stream: true,
    });

    let fullText = '';
    for await (const chunk of stream) {
      if (clientClosed) break;
      const delta = chunk?.choices?.[0]?.delta?.content || '';
      if (!delta) continue;
      fullText += delta;
      sseWrite(res, 'delta', { delta });
    }
    const tLlm1 = Date.now();

    // Safety: if streaming produced no text (rare), fall back to a non-stream generation
    // so the UI doesn't end up with an empty assistant message.
    if (!clientClosed && fullText.trim().length === 0) {
      try {
        const fallback = await generateResponse(text.trim(), undefined, history);
        if (fallback && fallback.trim().length > 0) {
          fullText = fallback;
          sseWrite(res, 'delta', { delta: fallback });
        }
      } catch (e) {
        console.warn('Fallback text generation failed (non-fatal):', e);
      }
    }

    // Persist final text + update conversation last message
    try {
      await updateMessage(conversationId, aiMessageId, { ai_response_text: fullText });
      await upsertConversation({
        id: conversationId,
        user_id: MOCK_USER_ID,
        title: titleToSet,
        last_message: fullText,
        last_message_at: aiCreatedAt || new Date(Date.now() + 1).toISOString(),
      });
    } catch (e) {
      console.warn('Failed to persist streamed final text (non-fatal):', e);
    }

    clearInterval(ping);
    if (!clientClosed) {
      sseWrite(res, 'meta', {
        timings: {
          total_ms: Date.now() - t0,
          db_ms: tDb1 - tDb0,
          llm_ms: tLlm1 - tLlm0,
        },
      });
      // Let the frontend render text immediately; audio may arrive a bit later.
      sseWrite(res, 'done', { text: fullText });
    }

    // Generate AI TTS and send audio ASAP via SSE (Engoo-like), then persist to Storage in background.
    const ttsStart = Date.now();
    if (fullText.trim().length === 0) {
      // Don't call TTS with empty string (OpenAI returns 400 string_too_short)
      return res.end();
    }
    const ttsJob = (async () => {
      const aiAudioDataUrl = await generateTTS(fullText, 1.0);
      const base64 = aiAudioDataUrl.split('base64,')[1];
      if (!base64) return { aiAudioDataUrl: null as string | null, buffer: null as Buffer | null };
      const buffer = Buffer.from(base64, 'base64');
      return { aiAudioDataUrl, buffer };
    })();

    // Wait a bit for TTS to finish; if it's too slow, don't block forever.
    let ttsResult: { aiAudioDataUrl: string | null; buffer: Buffer | null } | null = null;
    try {
      ttsResult = await Promise.race([
        ttsJob,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000)),
      ]);
    } catch (e) {
      console.warn('AI TTS generation failed (stream route):', e);
    }

    if (!clientClosed && ttsResult?.aiAudioDataUrl) {
      sseWrite(res, 'audio', {
        audioDataUrl: ttsResult.aiAudioDataUrl,
        tts_ms: Date.now() - ttsStart,
      });
    }

    // Background: upload to Supabase Storage for persistence (doesn't gate playback)
    if (ttsResult?.buffer) {
      setImmediate(async () => {
        try {
          const path = `${MOCK_USER_ID}/${conversationId}/${aiMessageId}/ai.mp3`;
          const uploadRes = await supabase.storage
            .from(SUPABASE_STORAGE_BUCKET)
            .upload(path, ttsResult!.buffer!, { contentType: 'audio/mpeg', upsert: true });
          if (uploadRes.error) throw uploadRes.error;

          const publicUrlRes = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(path);
          const url = publicUrlRes.data.publicUrl;
          await updateMessage(conversationId, aiMessageId, { ai_audio_url: url });
        } catch (e) {
          console.warn('AI TTS background upload failed (stream route):', e);
        }
      });
    }

    return res.end();
  } catch (error: any) {
    console.error('Streaming message failed:', error);
    try {
      sseWrite(res, 'error', { error: error?.message || 'Streaming failed' });
    } catch {
      // ignore
    }
    return res.end();
  }
});

router.post('/start', async (req, res) => {
  try {
    const { conversationId, title } = req.body || {};
    if (!conversationId || typeof conversationId !== 'string') {
      return res.status(400).json({ error: 'conversationId is required.' });
    }
    await upsertConversation({ id: conversationId, title: title || 'New Conversation', user_id: MOCK_USER_ID });
    res.json({ conversationId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start conversation' });
  }
});

router.get('/list', async (req, res) => {
  try {
    const conversations = await listConversations(MOCK_USER_ID);
    res.json({ conversations });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to list conversations' });
  }
});

router.get('/:id/messages', async (req, res) => {
  try {
    const conversationId = req.params.id;
    const messages = await listMessages(conversationId, MOCK_USER_ID);
    res.json({ messages });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to list messages' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const conversationId = req.params.id;
    await deleteConversationById(conversationId, MOCK_USER_ID);
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to delete conversation' });
  }
});

router.post('/:id/reset', async (req, res) => {
  try {
    const conversationId = req.params.id;

    // Delete all messages in DB for this conversation
    await deleteMessagesByConversation(conversationId, MOCK_USER_ID);

    // Reset conversation last message fields (keep title)
    const conv = await getConversation(conversationId, MOCK_USER_ID);
    await upsertConversation({
      id: conversationId,
      user_id: MOCK_USER_ID,
      title: conv?.title ?? 'Conversation',
      last_message: null,
      last_message_at: null,
    });

    // Best-effort: delete audio objects under this conversation prefix in Storage
    try {
      const basePrefix = `${MOCK_USER_ID}/${conversationId}`;
      const level1 = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).list(basePrefix, { limit: 1000 });
      if (level1.error) throw level1.error;

      const pathsToRemove: string[] = [];
      for (const item of level1.data || []) {
        if (!item.name) continue;
        const messageFolder = `${basePrefix}/${item.name}`;
        const files = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).list(messageFolder, { limit: 1000 });
        if (files.error) continue;
        for (const f of files.data || []) {
          if (!f.name) continue;
          // Remove files inside message folder
          pathsToRemove.push(`${messageFolder}/${f.name}`);
        }
      }

      if (pathsToRemove.length > 0) {
        const rm = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).remove(pathsToRemove);
        if (rm.error) throw rm.error;
      }
    } catch (e) {
      console.warn('Storage cleanup failed (non-fatal):', e);
    }

    res.json({ ok: true });
  } catch (error: any) {
    console.error('Failed to reset conversation:', error);
    res.status(500).json({ error: error?.message || 'Failed to reset conversation' });
  }
});

router.post('/message', async (req, res) => {
  try {
    const t0 = Date.now();
    const {
      text,
      sessionId, // we treat sessionId as conversationId for now
      conversationHistory,
      userMessageId,
      aiMessageId,
      isSuggestedReply,
      userCreatedAt,
      aiCreatedAt,
    } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required and cannot be empty.' });
    }

    const conversationId = sessionId || 'temp-session';
    if (!userMessageId || !aiMessageId) {
      return res.status(400).json({ error: 'userMessageId and aiMessageId are required.' });
    }

    // Ensure conversation exists and set title if missing
    const existingConv = await getConversation(conversationId, MOCK_USER_ID);
    const titleToSet = existingConv?.title ? existingConv.title : text.trim().substring(0, 50);
    await upsertConversation({
      id: conversationId,
      user_id: MOCK_USER_ID,
      title: titleToSet,
      last_message: text.trim(),
      last_message_at: userCreatedAt || new Date().toISOString(),
    });

    // Generate AI text
    const t1 = Date.now();
    const result = await processTextMessage(text.trim(), conversationId, conversationHistory || []);
    const t2 = Date.now();

    // Insert messages (fast path: don't wait for audio generation)
    await insertMessages([
      {
        id: userMessageId,
        conversation_id: conversationId,
        user_id: MOCK_USER_ID,
        type: 'user',
        transcription: text.trim(),
        ai_response_text: null,
        corrected_text: null,
        explanation: null,
        user_audio_url: null,
        ai_audio_url: null,
        is_suggested_reply: !!isSuggestedReply,
        created_at: userCreatedAt || new Date().toISOString(),
      },
      {
        id: aiMessageId,
        conversation_id: conversationId,
        user_id: MOCK_USER_ID,
        type: 'ai',
        transcription: null,
        ai_response_text: result.aiResponseText,
        corrected_text: null,
        explanation: null,
        user_audio_url: null,
        ai_audio_url: null,
        is_suggested_reply: false,
        created_at: aiCreatedAt || new Date(Date.now() + 1).toISOString(),
      },
    ]);
    const t3 = Date.now();

    await upsertConversation({
      id: conversationId,
      user_id: MOCK_USER_ID,
      title: titleToSet,
      last_message: result.aiResponseText,
      last_message_at: aiCreatedAt || new Date(Date.now() + 1).toISOString(),
    });

    // Background: generate AI TTS and store to Supabase Storage (if OpenAI key exists)
    setImmediate(async () => {
      try {
        const aiAudioDataUrl = await generateTTS(result.aiResponseText, 1.0);
        const base64 = aiAudioDataUrl.split('base64,')[1];
        if (!base64) return;
        const buffer = Buffer.from(base64, 'base64');
        const path = `${MOCK_USER_ID}/${conversationId}/${aiMessageId}/ai.mp3`;

        const uploadRes = await supabase.storage
          .from(SUPABASE_STORAGE_BUCKET)
          .upload(path, buffer, { contentType: 'audio/mpeg', upsert: true });
        if (uploadRes.error) throw uploadRes.error;

        const publicUrlRes = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(path);
        const url = publicUrlRes.data.publicUrl;
        await updateMessage(conversationId, aiMessageId, { ai_audio_url: url });
      } catch (e) {
        // Non-fatal
        console.warn('AI TTS background job failed:', e);
      }
    });

    res.json({
      aiResponseText: result.aiResponseText,
      timings: {
        total_ms: Date.now() - t0,
        pre_ms: t1 - t0,
        llm_ms: t2 - t1,
        db_ms: t3 - t2,
      },
    });
  } catch (error: any) {
    console.error('Error processing text message:', error);
    
    // Extract user-friendly error message
    const errorMessage = error?.message || 'Failed to process message.';
    
    // Determine appropriate status code
    let statusCode = 500;
    if (error?.message?.includes('quota') || error?.message?.includes('Too many requests')) {
      statusCode = 429;
    } else if (error?.message?.includes('API key') || error?.message?.includes('invalid')) {
      statusCode = 401;
    } else if (error?.message?.includes('Invalid request')) {
      statusCode = 400;
    }
    
    res.status(statusCode).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    });
  }
});

router.post('/message/:id/audio', upload.single('file'), async (req, res) => {
  try {
    const messageId = req.params.id;
    const { conversationId, kind } = req.body || {};
    if (!conversationId || typeof conversationId !== 'string') {
      return res.status(400).json({ error: 'conversationId is required.' });
    }
    if (!kind || (kind !== 'user' && kind !== 'ai')) {
      return res.status(400).json({ error: 'kind must be user|ai' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'file is required.' });
    }

    const ext = kind === 'user' ? 'webm' : 'mp3';
    const contentType = kind === 'user' ? (req.file.mimetype || 'audio/webm') : 'audio/mpeg';
    const path = `${MOCK_USER_ID}/${conversationId}/${messageId}/${kind}.${ext}`;

    const uploadRes = await supabase.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .upload(path, req.file.buffer, { contentType, upsert: true });
    if (uploadRes.error) throw uploadRes.error;

    const publicUrlRes = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(path);
    const url = publicUrlRes.data.publicUrl;

    if (kind === 'user') {
      await updateMessage(conversationId, messageId, { user_audio_url: url });
    } else {
      await updateMessage(conversationId, messageId, { ai_audio_url: url });
    }

    res.json({ url });
  } catch (error: any) {
    console.error('Error uploading audio:', error);
    res.status(500).json({ error: error?.message || 'Failed to upload audio' });
  }
});

router.post('/feedback', async (req, res) => {
  try {
    const { text, conversationId, messageId } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required and cannot be empty.' });
    }

    const result = await processFeedback(text.trim());

    // Optional persistence: if conversationId + messageId are provided, store feedback to DB
    if (conversationId && messageId) {
      try {
        await updateMessage(conversationId, messageId, {
          corrected_text: result.correctedText,
          explanation: result.explanation,
        } as any);
      } catch (e) {
        // Non-fatal
        console.warn('Failed to persist feedback:', e);
      }
    }

    res.json(result);
  } catch (error: any) {
    console.error('Error processing feedback:', error);
    const errorMessage = error?.message || 'Failed to process feedback.';
    res.status(500).json({ error: errorMessage });
  }
});

router.post('/suggestions', async (req, res) => {
  try {
    const { lastAiText, conversationHistory } = req.body;
    if (!lastAiText || typeof lastAiText !== 'string' || lastAiText.trim().length === 0) {
      return res.status(400).json({ error: 'lastAiText is required and cannot be empty.' });
    }

    const result = await processSuggestedReplies(lastAiText.trim(), conversationHistory || []);
    res.json(result);
  } catch (error: any) {
    console.error('Error generating suggestions:', error);
    const errorMessage = error?.message || 'Failed to generate suggestions.';
    res.status(500).json({ error: errorMessage });
  }
});

export default router;
