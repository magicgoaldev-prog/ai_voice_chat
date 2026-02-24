import { correctText, generateResponse, generateSuggestedReplies } from './llmService';

// Process text message (STT is now handled on frontend with Web Speech API)
export async function processTextMessage(
  text: string,
  sessionId?: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  englishLevel: 'beginner' | 'intermediate' | 'advanced' = 'beginner'
) {
  // Generate AI Response with conversation history
  const aiResponseText = await generateResponse(text, sessionId, conversationHistory || [], englishLevel);

  // TTS is handled on frontend with Web Speech API
  return {
    transcription: text,
    aiResponseText,
  };
}

// On-demand feedback (correction + explanation)
export async function processFeedback(text: string) {
  return await correctText(text);
}

// Suggested replies for last AI message
export async function processSuggestedReplies(
  lastAiText: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
) {
  const suggestions = await generateSuggestedReplies(lastAiText, conversationHistory || []);
  return { suggestions };
}

// Keep for backward compatibility (deprecated)
export async function processVoiceMessage(
  audioFile: Express.Multer.File,
  sessionId?: string
) {
  throw new Error('processVoiceMessage is deprecated. Use processTextMessage instead.');
}
