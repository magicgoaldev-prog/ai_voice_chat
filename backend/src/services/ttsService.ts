import OpenAI from 'openai';

// Lazy initialization to ensure env vars are loaded
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set in environment variables');
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

export async function generateTTS(
  text: string,
  speed: number = 1.0
): Promise<string> {
  try {
    const response = await getOpenAIClient().audio.speech.create({
      model: 'tts-1',
      voice: 'alloy',
      input: text,
      speed: Math.max(0.25, Math.min(4.0, speed)), // OpenAI allows 0.25 to 4.0
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    
    // For MVP, return base64 encoded audio
    // In production, save to cloud storage and return URL
    const base64Audio = buffer.toString('base64');
    return `data:audio/mp3;base64,${base64Audio}`;
  } catch (error) {
    console.error('TTS Error:', error);
    throw new Error('Failed to generate speech');
  }
}
