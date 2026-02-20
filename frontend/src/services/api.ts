import axios from 'axios';
import { ConversationResponse, TranslationResponse } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export async function sendTextMessage(
  text: string,
  sessionId?: string
): Promise<ConversationResponse> {
  try {
    const response = await axios.post<ConversationResponse>(
      `${API_BASE_URL}/conversation/message`,
      {
        text,
        sessionId: sessionId || 'temp-session',
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30 seconds timeout for processing
      }
    );

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
