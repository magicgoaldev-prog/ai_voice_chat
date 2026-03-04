export type EnglishLevel = 'beginner' | 'intermediate' | 'advanced';

export interface AISpeaker {
  id: string;
  name: string;
  photo: string; // URL or data URL
  voiceName: string; // SpeechSynthesisVoice name
  gender?: 'male' | 'female';
  age?: 'young' | 'adult' | 'senior';
}

export type UserSettings = {
  /** Google Translate target language code (e.g., 'ru', 'ko') */
  targetLanguage: string;
  /** Affects AI response style */
  englishLevel: EnglishLevel;
  /** Selected AI Speaker ID */
  aiSpeakerId?: string;
};

const SETTINGS_KEY = 'eng_ai_voice_user_settings';

export const DEFAULT_USER_SETTINGS: UserSettings = {
  targetLanguage: 'ru', // default: Russian
  englishLevel: 'beginner',
};

export function loadUserSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_USER_SETTINGS };
    const parsed = JSON.parse(raw);
    const targetLanguage =
      typeof parsed?.targetLanguage === 'string' && parsed.targetLanguage.trim().length > 0
        ? parsed.targetLanguage.trim()
        : DEFAULT_USER_SETTINGS.targetLanguage;
    const englishLevel: EnglishLevel =
      parsed?.englishLevel === 'beginner' || parsed?.englishLevel === 'intermediate' || parsed?.englishLevel === 'advanced'
        ? parsed.englishLevel
        : DEFAULT_USER_SETTINGS.englishLevel;
    const aiSpeakerId =
      typeof parsed?.aiSpeakerId === 'string' && parsed.aiSpeakerId.trim().length > 0
        ? parsed.aiSpeakerId.trim()
        : undefined;
    return { targetLanguage, englishLevel, aiSpeakerId };
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
}

export function saveUserSettings(next: Partial<UserSettings>): UserSettings {
  const current = loadUserSettings();
  const merged: UserSettings = {
    ...current,
    ...next,
  };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  } catch {
    // ignore
  }
  return merged;
}

