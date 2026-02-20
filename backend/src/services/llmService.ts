// Simple rule-based text correction (free alternative)
// Can be enhanced with OpenAI API if available

function simpleTextCorrection(text: string): { correctedText: string; explanation: string } {
  let corrected = text;
  const explanations: string[] = [];

  // Common corrections
  // Fix "i" to "I"
  corrected = corrected.replace(/\bi\b/g, 'I');
  if (text !== corrected) {
    explanations.push('Capitalized "I" when referring to yourself.');
  }

  // Fix double spaces
  const originalCorrected = corrected;
  corrected = corrected.replace(/\s+/g, ' ');
  if (originalCorrected !== corrected) {
    explanations.push('Removed extra spaces.');
  }

  // Fix missing punctuation at the end
  if (corrected.length > 0 && !/[.!?]$/.test(corrected.trim())) {
    corrected = corrected.trim() + '.';
    explanations.push('Added period at the end.');
  }

  // Capitalize first letter
  if (corrected.length > 0) {
    corrected = corrected.charAt(0).toUpperCase() + corrected.slice(1);
  }

  return {
    correctedText: corrected,
    explanation: explanations.length > 0 
      ? explanations.join(' ') 
      : 'No obvious errors found. Great job!',
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

      const prompt = `Correct the following English sentence and explain the errors in a simple, educational way:

"${text}"

Format your response as JSON:
{
  "corrected": "[corrected sentence]",
  "explanation": "[brief explanation of errors]"
}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful English teacher. Correct grammar mistakes and explain them clearly.',
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
  sessionId?: string
): Promise<string> {
  // Try OpenAI API if available, otherwise use simple responses
  const openaiApiKey = process.env.OPENAI_API_KEY;
  
  // Check if we should skip API call due to recent quota error
  const timeSinceLastError = Date.now() - lastResponseQuotaErrorTime;
  if (responseQuotaExceeded && timeSinceLastError < QUOTA_ERROR_COOLDOWN) {
    console.log('Skipping OpenAI API call for response generation due to recent quota error, using simple response');
    // Fall through to simple responses
  } else {
    // Reset quota error flag after cooldown period
    if (responseQuotaExceeded && timeSinceLastError >= QUOTA_ERROR_COOLDOWN) {
      responseQuotaExceeded = false;
      console.log('Response quota error cooldown expired, retrying OpenAI API');
    }
    
    if (openaiApiKey) {
      try {
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey: openaiApiKey });

        const systemPrompt = `You are a friendly English conversation partner. Respond naturally to what the user says, as if you're having a casual conversation. Keep responses concise (1-2 sentences). Adjust your language level based on the user's English proficiency.`;

        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: userText,
            },
          ],
          temperature: 0.7,
          max_tokens: 150,
        });

        // Reset quota error flag on success
        responseQuotaExceeded = false;
        return response.choices[0].message.content || "I'm here to help you practice English!";
      } catch (error: any) {
        // Check if it's a quota error
        if (error?.code === 'insufficient_quota' || error?.status === 429) {
          responseQuotaExceeded = true;
          lastResponseQuotaErrorTime = Date.now();
          console.warn('OpenAI API quota exceeded for response generation, will use simple responses for next 5 minutes');
        } else {
          console.error('OpenAI API error, using simple response:', error?.message || error);
        }
        // Fall back to simple responses
      }
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
