// Simple rule-based text correction (free alternative)
// Can be enhanced with OpenAI API if available

function simpleTextCorrection(
  text: string,
  practiceLanguage: 'en' | 'he' = 'en'
): { correctedText: string; explanation: string } {
  // Conservative fallback: don't nitpick punctuation/capitalization.
  const collapsed = text.replace(/\s+/g, ' ').trim();
  const ru = practiceLanguage === 'he';
  if (collapsed !== text.trim()) {
    return {
      correctedText: collapsed,
      explanation: ru ? 'Удалены лишние пробелы.' : 'Removed extra spaces.',
    };
  }

  return {
    correctedText: text,
    explanation: ru
      ? 'Звучит естественно. Существенных грамматических ошибок не найдено.'
      : 'Looks natural. No major grammar issues found.',
  };
}

// Track quota errors to avoid repeated API calls
let quotaExceeded = false;
let lastQuotaErrorTime = 0;
const QUOTA_ERROR_COOLDOWN = 5 * 60 * 1000; // 5 minutes

export async function correctText(
  text: string,
  practiceLanguage: 'en' | 'he' = 'en'
): Promise<{ correctedText: string; explanation: string }> {
  const openaiApiKey = process.env.OPENAI_API_KEY;

  const timeSinceLastError = Date.now() - lastQuotaErrorTime;
  if (quotaExceeded && timeSinceLastError < QUOTA_ERROR_COOLDOWN) {
    return simpleTextCorrection(text, practiceLanguage);
  }
  if (quotaExceeded && timeSinceLastError >= QUOTA_ERROR_COOLDOWN) {
    quotaExceeded = false;
  }

  if (openaiApiKey) {
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: openaiApiKey });

      const isHebrew = practiceLanguage === 'he';
      const prompt = isHebrew
        ? `Evaluate the user's Hebrew. Only correct if clearly ungrammatical or unnatural. If fine, keep unchanged. The "corrected" field must remain Hebrew. Write the "explanation" field in Russian only (brief grammar/usage notes for the learner).\n\nUser text:\n"${text}"\n\nFormat as JSON: {"corrected": "...", "explanation": "..."}`
        : `You will evaluate the user's English. Do NOT focus on punctuation/capitalization. Only correct if clearly ungrammatical or unnatural. If natural enough, keep unchanged.\n\nUser text:\n"${text}"\n\nFormat as JSON: {"corrected": "...", "explanation": "..."}`;

      const systemContent = isHebrew
        ? 'You are a friendly Hebrew coach. Correct major grammar only. If no correction needed, keep the original Hebrew text and explain briefly in Russian only.'
        : 'You are a strict but friendly English coach. Only correct major grammar or strongly unnatural phrasing. If no meaningful correction is needed, keep the original and say it sounds natural.';

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      quotaExceeded = false;
      return {
        correctedText: result.corrected || text,
        explanation: result.explanation || (isHebrew ? 'Существенных ошибок не найдено.' : 'No errors found.'),
      };
    } catch (error: any) {
      // Check if it's a quota error
      if (error?.code === 'insufficient_quota' || error?.status === 429) {
        quotaExceeded = true;
        lastQuotaErrorTime = Date.now();
        console.warn('OpenAI API quota exceeded, will use simple correction for next 5 minutes');
      } else {
        console.error('OpenAI API error, using simple correction:', error?.message || error);
      }
      // Fall back to simple correction
      return simpleTextCorrection(text, practiceLanguage);
    }
  }

  // Use simple rule-based correction (free)
  return simpleTextCorrection(text, practiceLanguage);
}

// Shared quota error tracking for generateResponse
let responseQuotaExceeded = false;
let lastResponseQuotaErrorTime = 0;

export async function generateResponse(
  userText: string,
  sessionId?: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  englishLevel: 'beginner' | 'intermediate' | 'advanced' = 'beginner',
  practiceLanguage: 'en' | 'he' = 'en'
): Promise<string> {
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!openaiApiKey) {
    console.warn('⚠️ OPENAI_API_KEY not found. Using rule-based responses.');
  }

  const timeSinceLastError = Date.now() - lastResponseQuotaErrorTime;
  if (responseQuotaExceeded && timeSinceLastError < QUOTA_ERROR_COOLDOWN) {
    // fall through to simple responses
  } else {
    if (responseQuotaExceeded && timeSinceLastError >= QUOTA_ERROR_COOLDOWN) {
      responseQuotaExceeded = false;
    }

    if (openaiApiKey) {
      try {
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: openaiApiKey });

        const levelGuide =
          englishLevel === 'beginner'
            ? practiceLanguage === 'he'
              ? 'Use simple words and short sentences. Avoid idioms and complex grammar. Ask simple follow-up questions. Respond only in Hebrew.'
              : 'Use simple words and short sentences (A2). Avoid idioms and complex grammar. Ask simple follow-up questions.'
            : englishLevel === 'intermediate'
              ? practiceLanguage === 'he'
                ? 'Use natural everyday Hebrew. Keep it friendly and conversational. Respond only in Hebrew.'
                : 'Use natural everyday English (B1-B2). Keep it friendly and conversational. Explain briefly if needed.'
              : practiceLanguage === 'he'
                ? 'Use natural, richer Hebrew while staying concise. Respond only in Hebrew.'
                : 'Use natural, rich English (C1). You can use idioms lightly. Keep it concise but engaging.';

        const systemPrompt =
          practiceLanguage === 'he'
            ? `You are a friendly Hebrew conversation partner. Respond naturally in Hebrew to what the user says, as if you're having a casual conversation. Keep responses concise (1-2 sentences). Level: ${englishLevel}. ${levelGuide} Remember the context of previous messages. Respond only in Hebrew.`
            : `You are a friendly English conversation partner. Respond naturally to what the user says, as if you're having a casual conversation. Keep responses concise (1-2 sentences). English level: ${englishLevel}. ${levelGuide} Remember the context of previous messages in the conversation.`;

        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: systemPrompt },
        ];

        conversationHistory.slice(-6).forEach((msg) => {
          messages.push({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content,
          });
        });

        messages.push({ role: 'user', content: userText });

        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.7,
          max_tokens: 120,
        });

        const defaultResponse =
          practiceLanguage === 'he'
            ? 'אני כאן כדי לעזור לך לתרגל עברית!'
            : "I'm here to help you practice English!";
        const aiResponse = response.choices[0].message.content || defaultResponse;

        responseQuotaExceeded = false;
        return aiResponse;
      } catch (error: any) {
        // Check if it's a quota error
        if (error?.code === 'insufficient_quota' || error?.status === 429) {
          responseQuotaExceeded = true;
          lastResponseQuotaErrorTime = Date.now();
          console.error('❌ OpenAI API quota exceeded for response generation, will use simple responses for next 5 minutes');
          console.error('Error details:', error?.message || error);
        } else {
          console.error('❌ OpenAI API error, using simple response');
          console.error('Error code:', error?.code);
          console.error('Error message:', error?.message);
          console.error('Error status:', error?.status);
          console.error('Full error:', error);
        }
        // Fall back to simple responses
      }
    } else {
      console.log('📝 No OpenAI API key, using rule-based responses');
    }
  }

  // Simple rule-based responses (free alternative)
  const lowerText = userText.toLowerCase();

  if (practiceLanguage === 'he') {
    if (/\b(שלום|היי|הי)\b/.test(userText) || lowerText.includes('hello') || lowerText.includes('hi')) {
      return 'שלום! איך אתה היום?';
    }
    if (/\b(איך אתה|מה נשמע)\b/.test(userText) || lowerText.includes('how are you')) {
      return 'אני בסדר, תודה! מה איתך?';
    }
    if (/\b(תודה|תודה רבה)\b/.test(userText) || lowerText.includes('thank you') || lowerText.includes('thanks')) {
      return 'בבקשה! בהצלחה בתרגול!';
    }
    if (/\b(ביי|להתראות)\b/.test(userText) || lowerText.includes('goodbye') || lowerText.includes('bye')) {
      return 'להתראות! היה נעים לדבר איתך!';
    }
    return 'זה מעניין! ספר לי עוד.';
  }

  if (lowerText.includes('hello') || lowerText.includes('hi') || lowerText.includes('hey')) {
    return "Hello! How are you today?";
  }
  if (lowerText.includes('how are you')) {
    return "I'm doing great, thank you for asking! How about you?";
  }
  if (lowerText.includes('thank you') || lowerText.includes('thanks')) {
    return "You're welcome! Keep practicing!";
  }
  if (lowerText.includes('goodbye') || lowerText.includes('bye')) {
    return "Goodbye! It was nice talking with you!";
  }
  return "That's interesting! Can you tell me more about that?";
}

export async function generateSuggestedReplies(
  lastAiText: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  practiceLanguage: 'en' | 'he' = 'en'
): Promise<string[]> {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const isHebrew = practiceLanguage === 'he';

  if (openaiApiKey) {
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: openaiApiKey });

      const systemPrompt = isHebrew
        ? 'You generate 3 short, natural reply suggestions in Hebrew for the user. Return JSON only: {"suggestions":["...","...","..."]}'
        : 'You generate 3 short, natural, varied reply suggestions for the USER. Keep them conversational and easy to speak. Return JSON only.';

      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
      ];

      conversationHistory.slice(-6).forEach((m) => {
        messages.push({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
        });
      });

      messages.push({ role: 'assistant', content: lastAiText });

      messages.push({
        role: 'user',
        content: isHebrew
          ? 'Suggest 3 possible user replies in Hebrew to the assistant message above. Format as JSON: {"suggestions":["...","...","..."]}'
          : 'Suggest 3 possible user replies to the assistant message above. Format as JSON: {"suggestions":["...","...","..."]}',
      });

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.8,
        max_tokens: 180,
        response_format: { type: 'json_object' },
      });

      const raw = response.choices[0].message.content || '{}';
      const parsed = JSON.parse(raw);
      const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];

      return suggestions
        .map((s: any) => (typeof s === 'string' ? s.trim() : ''))
        .filter((s: string) => s.length > 0)
        .slice(0, 3);
    } catch (error: any) {
      console.error('❌ OpenAI API error while generating suggestions, using fallback:', error?.message || error);
    }
  }

  // Fallback suggestions (rule-based)
  const base = lastAiText.trim();
  if (isHebrew) {
    const genericHe = ['זה הגיוני. תוכל לתת דוגמה?', 'תודה! תשאל שאלת המשך?', 'אני רואה. הנה התשובה שלי:'];
    const looksLikeQuestion = /[?]$/.test(base) || /\b(מה|למה|איך|מתי|איפה|איזה)\b/.test(base);
    if (looksLikeQuestion) {
      return ['שאלה טובה. אני חושב ש...', 'אני לא בטוח, אבל אולי...', 'אסביר:'];
    }
    return genericHe;
  }

  const generic = [
    "That makes sense. Can you give me an example?",
    "Thanks! Could you ask me a follow-up question?",
    "I see. Here's my answer: ",
  ];
  const looksLikeQuestion = /[?]$/.test(base) || /\b(what|why|how|when|where|which)\b/i.test(base);
  if (looksLikeQuestion) {
    return [
      "Good question. I think ...",
      "I'm not sure yet, but maybe ...",
      "Let me explain: ...",
    ];
  }
  return generic;
}
