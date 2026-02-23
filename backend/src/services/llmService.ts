// Simple rule-based text correction (free alternative)
// Can be enhanced with OpenAI API if available

function simpleTextCorrection(text: string): { correctedText: string; explanation: string } {
  // Conservative fallback: don't nitpick punctuation/capitalization.
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed !== text.trim()) {
    return {
      correctedText: collapsed,
      explanation: 'Removed extra spaces.',
    };
  }

  return {
    correctedText: text,
    explanation: 'Looks natural. No major grammar issues found.',
  };
}

// Track quota errors to avoid repeated API calls
let quotaExceeded = false;
let lastQuotaErrorTime = 0;
const QUOTA_ERROR_COOLDOWN = 5 * 60 * 1000; // 5 minutes

export async function correctText(
  text: string
): Promise<{ correctedText: string; explanation: string }> {
  // Try OpenAI API if available, otherwise use simple correction
  const openaiApiKey = process.env.OPENAI_API_KEY;
  
  // Check if we should skip API call due to recent quota error
  const timeSinceLastError = Date.now() - lastQuotaErrorTime;
  if (quotaExceeded && timeSinceLastError < QUOTA_ERROR_COOLDOWN) {
    console.log('Skipping OpenAI API call due to recent quota error, using simple correction');
    return simpleTextCorrection(text);
  }
  
  // Reset quota error flag after cooldown period
  if (quotaExceeded && timeSinceLastError >= QUOTA_ERROR_COOLDOWN) {
    quotaExceeded = false;
    console.log('Quota error cooldown expired, retrying OpenAI API');
  }
  
  if (openaiApiKey) {
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: openaiApiKey });

      const prompt = `You will evaluate the user's English.

IMPORTANT:
- Do NOT focus on punctuation, capitalization, or minor style.
- Only correct if the sentence is clearly ungrammatical OR significantly unnatural compared to native speakers.
- If it's already natural enough, keep it unchanged and explain briefly that it's fine.

User text:
"${text}"

Format your response as JSON:
{
  "corrected": "[corrected sentence]",
  "explanation": "[brief explanation of changes or why it's fine]"
}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a strict but friendly English coach. ' +
              'Only correct major grammar or strongly unnatural phrasing. ' +
              'Ignore punctuation/capitalization unless it changes meaning. ' +
              'If no meaningful correction is needed, keep the original text and say it sounds natural.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      // Reset quota error flag on success
      quotaExceeded = false;
      return {
        correctedText: result.corrected || text,
        explanation: result.explanation || 'No errors found.',
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
      return simpleTextCorrection(text);
    }
  }

  // Use simple rule-based correction (free)
  return simpleTextCorrection(text);
}

// Shared quota error tracking for generateResponse
let responseQuotaExceeded = false;
let lastResponseQuotaErrorTime = 0;

export async function generateResponse(
  userText: string,
  sessionId?: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<string> {
  // Try OpenAI API if available, otherwise use simple responses
  const openaiApiKey = process.env.OPENAI_API_KEY;
  
  // Debug: Log API key status
  if (!openaiApiKey) {
    console.warn('⚠️ OPENAI_API_KEY not found in environment variables. Using rule-based responses.');
    console.warn('💡 To enable AI responses, set OPENAI_API_KEY in your .env file');
  } else {
    console.log('✅ OPENAI_API_KEY found, attempting to use OpenAI API');
  }
  
  // Check if we should skip API call due to recent quota error
  const timeSinceLastError = Date.now() - lastResponseQuotaErrorTime;
  if (responseQuotaExceeded && timeSinceLastError < QUOTA_ERROR_COOLDOWN) {
    console.log('⏸️ Skipping OpenAI API call for response generation due to recent quota error, using simple response');
    // Fall through to simple responses
  } else {
    // Reset quota error flag after cooldown period
    if (responseQuotaExceeded && timeSinceLastError >= QUOTA_ERROR_COOLDOWN) {
      responseQuotaExceeded = false;
      console.log('🔄 Response quota error cooldown expired, retrying OpenAI API');
    }
    
    if (openaiApiKey) {
      try {
        console.log('🤖 Calling OpenAI API with conversation history:', {
          historyLength: conversationHistory.length,
          userText: userText.substring(0, 50),
        });
        
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: openaiApiKey });

        const systemPrompt = `You are a friendly English conversation partner. Respond naturally to what the user says, as if you're having a casual conversation. Keep responses concise (1-2 sentences). Adjust your language level based on the user's English proficiency. Remember the context of previous messages in the conversation.`;

        // Build messages array with conversation history
        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          {
            role: 'system',
            content: systemPrompt,
          },
        ];

        // Add conversation history (last 10 messages for context)
        conversationHistory.slice(-10).forEach((msg) => {
          messages.push({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content,
          });
        });

        // Add current user message
        messages.push({
          role: 'user',
          content: userText,
        });

        console.log('📤 Sending to OpenAI:', {
          messageCount: messages.length,
          model: 'gpt-4o-mini',
        });

        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: messages,
          temperature: 0.7,
          max_tokens: 150,
        });

        const aiResponse = response.choices[0].message.content || "I'm here to help you practice English!";
        console.log('✅ OpenAI API response received:', aiResponse.substring(0, 50));
        
        // Reset quota error flag on success
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
  
  // Default response
  return "That's interesting! Can you tell me more about that?";
}

export async function generateSuggestedReplies(
  lastAiText: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<string[]> {
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (openaiApiKey) {
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: openaiApiKey });

      const systemPrompt =
        'You generate 3 short, natural, varied reply suggestions for the USER. ' +
        'Keep them conversational and easy to speak. Return JSON only.';

      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
      ];

      // Add a small amount of context (last 6 turns max)
      conversationHistory.slice(-6).forEach((m) => {
        messages.push({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
        });
      });

      messages.push({
        role: 'assistant',
        content: lastAiText,
      });

      messages.push({
        role: 'user',
        content:
          'Suggest 3 possible user replies to the assistant message above. ' +
          'Format as JSON: {"suggestions":["...","...","..."]}',
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
  const generic = [
    "That makes sense. Can you give me an example?",
    "Thanks! Could you ask me a follow-up question?",
    "I see. Here's my answer: ",
  ];

  // If assistant asked a question, provide direct reply styles
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
