import { correctText, generateResponse } from './llmService';

// Process text message (STT is now handled on frontend with Web Speech API)
export async function processTextMessage(
  text: string,
  sessionId?: string
) {
  // Step 1: Text Correction
  const { correctedText, explanation } = await correctText(text);

  // Step 2: Generate AI Response
  const aiResponseText = await generateResponse(text, sessionId);

  // Step 3: TTS is now handled on frontend with Web Speech API
  // Return empty string for aiResponseAudio (frontend will handle TTS)
  return {
    transcription: text,
    correctedText,
    explanation,
    aiResponseText,
    aiResponseAudio: '', // Frontend will use Web Speech API TTS
  };
}

// Keep for backward compatibility (deprecated)
export async function processVoiceMessage(
  audioFile: Express.Multer.File,
  sessionId?: string
) {
  throw new Error('processVoiceMessage is deprecated. Use processTextMessage instead.');
}
