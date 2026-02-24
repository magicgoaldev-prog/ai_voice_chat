import axios from 'axios';
import { Conversation, ConversationResponse, FeedbackResponse, Message, SuggestionsResponse, TranslationResponse } from '../types';
import { loadUserSettings } from '../utils/userSettings';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export async function sendTextMessageStream(
  text: string,
  sessionId?: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  meta?: {
    userMessageId: string;
    aiMessageId: string;
    isSuggestedReply?: boolean;
    userCreatedAt?: string;
    aiCreatedAt?: string;
  },
  handlers?: {
    onDelta?: (delta: string) => void;
    onMeta?: (meta: any) => void;
    onAudioDataUrl?: (audioDataUrl: string) => void;
  }
): Promise<{ aiResponseText: string; timings?: any }> {
  const { englishLevel } = loadUserSettings();
  const start = performance.now();
  const resp = await fetch(`${API_BASE_URL}/conversation/message/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      text,
      sessionId: sessionId || 'temp-session',
      conversationHistory: conversationHistory || [],
      englishLevel,
      userMessageId: meta?.userMessageId,
      aiMessageId: meta?.aiMessageId,
      isSuggestedReply: !!meta?.isSuggestedReply,
      userCreatedAt: meta?.userCreatedAt,
      aiCreatedAt: meta?.aiCreatedAt,
    }),
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => '');
    throw new Error(msg || `Streaming request failed (${resp.status})`);
  }
  if (!resp.body) {
    throw new Error('Streaming response body is empty.');
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let full = '';
  let timings: any | undefined;

  const processEventBlock = (block: string) => {
    const lines = block.split('\n').map((l) => l.replace(/\r$/, ''));
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith(':')) continue; // comment/keep-alive
      if (line.startsWith('event:')) event = line.slice('event:'.length).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trim());
    }
    const dataStr = dataLines.join('\n');
    if (!dataStr) return;

    if (event === 'delta') {
      const parsed = JSON.parse(dataStr);
      const delta = typeof parsed.delta === 'string' ? parsed.delta : '';
      if (delta) {
        full += delta;
        handlers?.onDelta?.(delta);
      }
      return;
    }
    if (event === 'meta') {
      const parsed = JSON.parse(dataStr);
      timings = parsed.timings;
      handlers?.onMeta?.(parsed);
      return;
    }
    if (event === 'audio') {
      const parsed = JSON.parse(dataStr);
      const audioDataUrl = typeof parsed.audioDataUrl === 'string' ? parsed.audioDataUrl : '';
      if (audioDataUrl) {
        handlers?.onAudioDataUrl?.(audioDataUrl);
      }
      return;
    }
    if (event === 'error') {
      const parsed = JSON.parse(dataStr);
      throw new Error(parsed?.error || 'Streaming error');
    }
    // done
    if (event === 'done') {
      // ignore; we rely on stream end
      return;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (block.trim().length === 0) continue;
      processEventBlock(block);
    }
  }

  // Safety: if stream completes with empty text, treat as failure so caller can fallback.
  if (full.trim().length === 0) {
    throw new Error('Streaming returned empty response');
  }

  const dur = Math.round(performance.now() - start);
  console.log('⏱️ sendTextMessageStream duration(ms):', dur);
  return { aiResponseText: full, timings };
}

export async function sendTextMessage(
  text: string,
  sessionId?: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  meta?: {
    userMessageId: string;
    aiMessageId: string;
    isSuggestedReply?: boolean;
    userCreatedAt?: string;
    aiCreatedAt?: string;
  }
): Promise<ConversationResponse> {
  try {
    const { englishLevel } = loadUserSettings();
    const start = performance.now();
    const response = await axios.post<ConversationResponse>(
      `${API_BASE_URL}/conversation/message`,
      {
        text,
        sessionId: sessionId || 'temp-session',
        conversationHistory: conversationHistory || [],
        englishLevel,
        userMessageId: meta?.userMessageId,
        aiMessageId: meta?.aiMessageId,
        isSuggestedReply: !!meta?.isSuggestedReply,
        userCreatedAt: meta?.userCreatedAt,
        aiCreatedAt: meta?.aiCreatedAt,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30 seconds timeout for processing
      }
    );

    const dur = Math.round(performance.now() - start);
    console.log('⏱️ sendTextMessage duration(ms):', dur);
    return response.data;
  } catch (error: any) {
    if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout. Please try again.');
    }
    if (error.response) {
      // Use the error message from backend if available
      const errorMessage = error.response.data?.error || 'Server error occurred.';
      throw new Error(errorMessage);
    }
    if (error.request) {
      throw new Error('Network error. Please check your connection.');
    }
    // If error is already a user-friendly message, throw it as is
    if (error.message) {
      throw error;
    }
    throw new Error('An unknown error occurred.');
  }
}

export async function listConversations(): Promise<Conversation[]> {
  const res = await axios.get<{ conversations: any[] }>(`${API_BASE_URL}/conversation/list`);
  return (res.data.conversations || []).map((row: any) => {
    const c: Conversation = {
      id: row.id,
      userId: row.user_id || undefined,
      title: row.title || undefined,
      lastMessage: row.last_message || undefined,
      lastMessageAt: row.last_message_at || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: row.message_count || undefined,
    };
    return c;
  });
}

export async function startConversation(conversationId: string, title?: string): Promise<{ conversationId: string }> {
  const res = await axios.post<{ conversationId: string }>(`${API_BASE_URL}/conversation/start`, {
    conversationId,
    title,
  });
  return res.data;
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await axios.delete(`${API_BASE_URL}/conversation/${conversationId}`);
}

export async function resetConversation(conversationId: string): Promise<void> {
  await axios.post(`${API_BASE_URL}/conversation/${conversationId}/reset`);
}

export async function getConversationMessages(conversationId: string): Promise<Message[]> {
  const res = await axios.get<{ messages: any[] }>(`${API_BASE_URL}/conversation/${conversationId}/messages`);
  // Map DB rows to frontend Message shape
  return (res.data.messages || []).map((row: any) => {
    const msg: Message = {
      id: row.id,
      conversationId: row.conversation_id,
      type: row.type,
      transcription: row.transcription || undefined,
      aiResponseText: row.ai_response_text || undefined,
      correctedText: row.corrected_text || undefined,
      explanation: row.explanation || undefined,
      userAudioUrl: row.user_audio_url || undefined,
      audioUrl: row.ai_audio_url || undefined,
      isSuggestedReply: !!row.is_suggested_reply,
      createdAt: row.created_at,
    };
    return msg;
  });
}

export async function uploadMessageAudio(params: {
  conversationId: string;
  messageId: string;
  kind: 'user' | 'ai';
  blob: Blob;
}): Promise<{ url: string }> {
  const form = new FormData();
  form.append('conversationId', params.conversationId);
  form.append('kind', params.kind);
  form.append('file', params.blob, `${params.kind}.${params.kind === 'user' ? 'webm' : 'mp3'}`);

  const res = await axios.post<{ url: string }>(
    `${API_BASE_URL}/conversation/message/${params.messageId}/audio`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 }
  );
  return res.data;
}

export async function getFeedback(
  text: string,
  meta?: { conversationId?: string; messageId?: string }
): Promise<FeedbackResponse> {
  try {
    const response = await axios.post<FeedbackResponse>(`${API_BASE_URL}/conversation/feedback`, {
      text,
      conversationId: meta?.conversationId,
      messageId: meta?.messageId,
    });
    return response.data;
  } catch (error: any) {
    if (error.response) {
      const errorMessage = error.response.data?.error || 'Server error occurred.';
      throw new Error(errorMessage);
    }
    throw error;
  }
}

export async function getSuggestions(
  lastAiText: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<SuggestionsResponse> {
  try {
    const response = await axios.post<SuggestionsResponse>(`${API_BASE_URL}/conversation/suggestions`, {
      lastAiText,
      conversationHistory: conversationHistory || [],
    });
    return response.data;
  } catch (error: any) {
    if (error.response) {
      const errorMessage = error.response.data?.error || 'Server error occurred.';
      throw new Error(errorMessage);
    }
    throw error;
  }
}

// Keep for backward compatibility, but now uses text instead of audio
export async function sendVoiceMessage(
  audioBlob: Blob
): Promise<ConversationResponse> {
  // This function is deprecated - use sendTextMessage instead
  throw new Error('sendVoiceMessage is deprecated. Use Web Speech API for transcription.');
}

export async function translateText(
  text: string,
  targetLanguage: string = 'ko'
): Promise<TranslationResponse> {
  try {
    const response = await axios.post<TranslationResponse>(
      `${API_BASE_URL}/translate`,
      { text, targetLanguage }
    );

    return response.data;
  } catch (error) {
    console.error('Translation API error:', error);
    throw error;
  }
}
