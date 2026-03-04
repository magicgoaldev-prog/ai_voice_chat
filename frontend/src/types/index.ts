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
  isSuggestedReply?: boolean; // true if user sent a suggested reply
  createdAt: string;
}

export interface ConversationResponse {
  transcription?: string;
  aiResponseText: string;
  correctedText?: string;
  explanation?: string;
}

export interface FeedbackResponse {
  correctedText: string;
  explanation: string;
}

export interface SuggestionsResponse {
  suggestions: string[];
}

export interface TranslationResponse {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
}
