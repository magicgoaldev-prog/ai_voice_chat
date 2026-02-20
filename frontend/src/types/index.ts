export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  settings?: UserSettings;
}

export interface UserSettings {
  language: string;
  englishLevel: 'beginner' | 'intermediate' | 'advanced';
  voiceSpeed: number;
  darkMode: boolean;
}

export interface Conversation {
  id: string;
  userId?: string;
  title?: string; // First message or auto-generated title
  lastMessage?: string;
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
}

export interface Message {
  id: string;
  conversationId: string;
  type: 'user' | 'ai';
  transcription?: string;
  correctedText?: string;
  explanation?: string;
  aiResponseText?: string;
  audioUrl?: string; // For AI messages
  userAudioUrl?: string; // For user recorded audio
  createdAt: string;
}

export interface ConversationResponse {
  transcription: string;
  correctedText: string;
  explanation: string;
  aiResponseText: string;
  aiResponseAudio?: string; // base64 or URL (optional, TTS handled by frontend)
}

export interface TranslationResponse {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
}
