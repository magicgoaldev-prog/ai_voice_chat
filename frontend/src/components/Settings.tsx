import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_USER_SETTINGS, EnglishLevel, loadUserSettings, saveUserSettings } from '../utils/userSettings';
import { DEFAULT_AI_SPEAKERS, assignVoicesToSpeakers } from '../utils/aiSpeakers';
import { AISpeaker } from '../utils/userSettings';
import { getEnglishVoices, waitForVoices, speakText, stopSpeaking } from '../utils/speechSynthesis';

type LangOption = { code: string; name: string };

// Google Translate supported languages (common set). Codes follow Google Translate v2 target codes.
// If you want the full list, we can expand this, but this already covers the vast majority of use-cases.
const GOOGLE_TRANSLATE_LANGUAGES: LangOption[] = [
  { code: 'ru', name: 'Russian' },
  { code: 'ko', name: 'Korean' },
  { code: 'ja', name: 'Japanese' },
  { code: 'zh', name: 'Chinese (Simplified)' },
  { code: 'zh-TW', name: 'Chinese (Traditional)' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'pt-PT', name: 'Portuguese (Portugal)' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'pl', name: 'Polish' },
  { code: 'tr', name: 'Turkish' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'th', name: 'Thai' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ms', name: 'Malay' },
  { code: 'tl', name: 'Filipino' },
  { code: 'nl', name: 'Dutch' },
  { code: 'sv', name: 'Swedish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'da', name: 'Danish' },
  { code: 'fi', name: 'Finnish' },
  { code: 'el', name: 'Greek' },
  { code: 'he', name: 'Hebrew' },
  { code: 'cs', name: 'Czech' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'ro', name: 'Romanian' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'sr', name: 'Serbian' },
  { code: 'hr', name: 'Croatian' },
  { code: 'sk', name: 'Slovak' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'lv', name: 'Latvian' },
  { code: 'et', name: 'Estonian' },
  { code: 'fa', name: 'Persian' },
  { code: 'ur', name: 'Urdu' },
  { code: 'bn', name: 'Bengali' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'mr', name: 'Marathi' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'kn', name: 'Kannada' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'sw', name: 'Swahili' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'am', name: 'Amharic' },
  { code: 'az', name: 'Azerbaijani' },
  { code: 'hy', name: 'Armenian' },
  { code: 'ka', name: 'Georgian' },
  { code: 'km', name: 'Khmer' },
  { code: 'lo', name: 'Lao' },
  { code: 'my', name: 'Myanmar (Burmese)' },
  { code: 'ne', name: 'Nepali' },
  { code: 'si', name: 'Sinhala' },
  { code: 'uz', name: 'Uzbek' },
  { code: 'kk', name: 'Kazakh' },
  { code: 'mn', name: 'Mongolian' },
  { code: 'is', name: 'Icelandic' },
  { code: 'ga', name: 'Irish' },
  { code: 'sq', name: 'Albanian' },
  { code: 'mk', name: 'Macedonian' },
];

export default function Settings() {
  const navigate = useNavigate();

  const initial = loadUserSettings();
  const [targetLanguage, setTargetLanguage] = useState<string>(initial.targetLanguage || DEFAULT_USER_SETTINGS.targetLanguage);
  const [englishLevel, setEnglishLevel] = useState<EnglishLevel>(initial.englishLevel || DEFAULT_USER_SETTINGS.englishLevel);
  const [aiSpeakerId, setAiSpeakerId] = useState<string | undefined>(initial.aiSpeakerId);
  const [languageQuery, setLanguageQuery] = useState('');
  const [isLangOpen, setIsLangOpen] = useState(false);
  const langWrapRef = useRef<HTMLDivElement | null>(null);
  const langSearchRef = useRef<HTMLInputElement | null>(null);
  const [aiSpeakers, setAiSpeakers] = useState<AISpeaker[]>(DEFAULT_AI_SPEAKERS);
  const [previewingSpeakerId, setPreviewingSpeakerId] = useState<string | null>(null);

  const filteredLanguages = useMemo(() => {
    const q = languageQuery.trim().toLowerCase();
    if (!q) return GOOGLE_TRANSLATE_LANGUAGES;
    return GOOGLE_TRANSLATE_LANGUAGES.filter(
      (l) => l.code.toLowerCase().includes(q) || l.name.toLowerCase().includes(q)
    );
  }, [languageQuery]);

  const selectedLang = useMemo(() => {
    return GOOGLE_TRANSLATE_LANGUAGES.find((l) => l.code === targetLanguage) || null;
  }, [targetLanguage]);

  useEffect(() => {
    if (!isLangOpen) return;
    setTimeout(() => {
      langSearchRef.current?.focus();
    }, 0);
  }, [isLangOpen]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (!isLangOpen) return;
      const el = langWrapRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setIsLangOpen(false);
        setLanguageQuery('');
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [isLangOpen]);

  // Load and assign voices to speakers
  useEffect(() => {
    waitForVoices().then((voices) => {
      const assigned = assignVoicesToSpeakers(DEFAULT_AI_SPEAKERS, voices);
      setAiSpeakers(assigned);
      
      // If no speaker is selected, select the first one
      if (!aiSpeakerId && assigned.length > 0) {
        setAiSpeakerId(assigned[0].id);
        saveUserSettings({ aiSpeakerId: assigned[0].id });
      }
    });
  }, []);

  const handlePreviewVoice = async (speaker: AISpeaker) => {
    if (previewingSpeakerId === speaker.id) {
      // Stop preview
      stopSpeaking();
      setPreviewingSpeakerId(null);
      return;
    }

    // Stop any current preview
    stopSpeaking();
    setPreviewingSpeakerId(speaker.id);

    const voices = getEnglishVoices();
    const voice = voices.find((v) => v.name === speaker.voiceName);

    try {
      await speakText({
        text: 'Hello! This is my voice. How do you like it?',
        lang: 'en-US',
        rate: 1.0,
        voice: voice || undefined,
      });
    } catch (error) {
      console.error('Preview voice error:', error);
    } finally {
      setPreviewingSpeakerId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            <button
              onClick={() => navigate('/conversation')}
              className="text-indigo-600 hover:text-indigo-800"
            >
              ← Back
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Translation Language
            </label>

            {/* Select-like combobox: closed looks like a normal select, open shows a search box above options */}
            <div className="relative" ref={langWrapRef}>
              <button
                type="button"
                onClick={() => setIsLangOpen((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                aria-haspopup="listbox"
                aria-expanded={isLangOpen}
              >
                <span className="text-sm text-gray-900">
                  {selectedLang ? `${selectedLang.name} (${selectedLang.code})` : targetLanguage}
                </span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-gray-500">
                  <path d="M7 10l5 5 5-5z" />
                </svg>
              </button>

              {isLangOpen && (
                <div
                  className="absolute z-20 mt-2 w-full rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden"
                  role="listbox"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setIsLangOpen(false);
                      setLanguageQuery('');
                    }
                  }}
                >
                  <div className="p-2 border-b border-gray-100 bg-white">
                    <input
                      ref={langSearchRef}
                      value={languageQuery}
                      onChange={(e) => setLanguageQuery(e.target.value)}
                      placeholder="Search... (e.g., Russian / ru)"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>

                  <div className="max-h-64 overflow-auto">
                    {filteredLanguages.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-gray-500">No matches.</div>
                    ) : (
                      filteredLanguages.map((l) => (
                        <button
                          key={l.code}
                          type="button"
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 ${
                            l.code === targetLanguage ? 'bg-indigo-50 text-indigo-800 font-semibold' : 'text-gray-800'
                          }`}
                          onClick={() => {
                            setTargetLanguage(l.code);
                            saveUserSettings({ targetLanguage: l.code });
                            setIsLangOpen(false);
                            setLanguageQuery('');
                          }}
                        >
                          {l.name} ({l.code})
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <p className="mt-2 text-xs text-gray-500">
              Used when you press Translate in the conversation screen. Default is Russian (ru).
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              English Level
            </label>
            <select
              value={englishLevel}
              onChange={(e) => {
                const v = e.target.value as EnglishLevel;
                setEnglishLevel(v);
                saveUserSettings({ englishLevel: v });
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
            <p className="mt-2 text-xs text-gray-500">
              This changes the AI response style (vocabulary/complexity) to match your level.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              AI Speaker
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {aiSpeakers.map((speaker) => {
                const isSelected = speaker.id === aiSpeakerId;
                const isPreviewing = previewingSpeakerId === speaker.id;
                return (
                  <div
                    key={speaker.id}
                    className={`relative border-2 rounded-lg p-4 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                    onClick={() => {
                      setAiSpeakerId(speaker.id);
                      saveUserSettings({ aiSpeakerId: speaker.id });
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={speaker.photo}
                        alt={speaker.name}
                        className="w-12 h-12 rounded-full object-cover border-2 border-gray-200"
                      />
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900">{speaker.name}</div>
                        <div className="text-xs text-gray-500 capitalize">
                          {speaker.gender} • {speaker.age}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePreviewVoice(speaker);
                        }}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          isPreviewing
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {isPreviewing ? '⏸ Stop' : '▶ Preview'}
                      </button>
                    </div>
                    {isSelected && (
                      <div className="absolute top-2 right-2">
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="text-indigo-600"
                        >
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Select an AI speaker and preview their voice. This voice will be used for AI responses.
            </p>
          </div>

          <div className="pt-4 border-t border-gray-200">
            {/* <button className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg">
              Logout
            </button> */}
          </div>
        </div>
      </div>
    </div>
  );
}
