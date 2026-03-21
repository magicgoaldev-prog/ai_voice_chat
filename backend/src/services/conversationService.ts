import { correctText, generateResponse, generateSuggestedReplies } from './llmService';

// Process text message (STT is now handled on frontend with Web Speech API)
export async function processTextMessage(
  text: string,
  sessionId?: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  englishLevel: 'beginner' | 'intermediate' | 'advanced' = 'beginner',
  practiceLanguage: 'en' | 'he' = 'en'
) {
  const aiResponseText = await generateResponse(text, sessionId, conversationHistory || [], englishLevel, practiceLanguage);

  return {
    transcription: text,
    aiResponseText,
  };
}

// On-demand feedback (correction + explanation)
export async function processFeedback(text: string, practiceLanguage: 'en' | 'he' = 'en') {
  return await correctText(text, practiceLanguage);
}

// Suggested replies for last AI message
export async function processSuggestedReplies(
  lastAiText: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  practiceLanguage: 'en' | 'he' = 'en'
) {
  const suggestions = await generateSuggestedReplies(lastAiText, conversationHistory || [], practiceLanguage);
  return { suggestions };
}

// Keep for backward compatibility (deprecated)
export async function processVoiceMessage(
  audioFile: Express.Multer.File,
  sessionId?: string
) {
  throw new Error('processVoiceMessage is deprecated. Use processTextMessage instead.');
}
