import { useState, useRef, useEffect } from 'react';
import AudioPlayer from './AudioPlayer';
import ErrorExplanation from './ErrorExplanation';
import { Message } from '../../types';
import { translateText } from '../../services/api';
import { loadUserSettings } from '../../utils/userSettings';

// Simple audio player for user recordings
function UserAudioPlayer({ audioUrl }: { audioUrl: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (audioUrl) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.onended = () => setIsPlaying(false);
      audioRef.current.onpause = () => setIsPlaying(false);
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [audioUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <button
      onClick={togglePlay}
      className="w-9 h-9 rounded-full bg-white/60 hover:bg-white/80 border border-gray-200/60 text-blue-600 flex items-center justify-center flex-shrink-0 transition-all shadow-sm"
      aria-label={isPlaying ? 'Pause recording' : 'Play recording'}
    >
      {isPlaying ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          {/* Speaker/audio icon */}
          <path d="M3 10v4h3l4 3V7L6 10H3z" />
          <path d="M14.5 8.5a4.5 4.5 0 010 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M16.8 6.2a8 8 0 010 11.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

interface MessageBubbleProps {
  message: Message;
  onRequestFeedback: (messageId: string) => void | Promise<void>;
  isFeedbackLoading: boolean;
  autoPlayAudio: boolean;
  onAutoplayConsumed: () => void;
}

export default function MessageBubble({
  message,
  onRequestFeedback,
  isFeedbackLoading,
  autoPlayAudio,
  onAutoplayConsumed,
}: MessageBubbleProps) {
  const [showExplanation, setShowExplanation] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);


  // Reset UI toggles when message changes
  useEffect(() => {
    setShowExplanation(false);
    setShowFeedback(false);
    setShowTranslation(false);
    setTranslatedText(null);
  }, [message.id]);
  
  if (message.type === 'user') {
    return (
      <div className="flex flex-col items-end space-y-2">
        {/* User name and avatar - above bubble, right side */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-gray-600 font-medium">me</span>
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-semibold">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          </div>
        </div>
        <div className="bg-blue-100 rounded-2xl rounded-tr-none px-4 py-3 max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg shadow-sm border border-blue-200/60">
          {message.transcription ? (
            <p className="text-sm text-gray-900 break-words whitespace-pre-wrap leading-relaxed">
              {message.transcription}
            </p>
          ) : (
            <p className="text-sm text-gray-500 italic">(No transcription available)</p>
          )}

          <div className="mt-3 flex items-center justify-between gap-3">
            {/* Feedback button shown for non-suggested replies */}
            {!message.isSuggestedReply && (
              <button
                onClick={async () => {
                  if (showFeedback) {
                    setShowFeedback(false);
                    return;
                  }

                  // Show feedback; if we don't have it yet, fetch on demand
                  setShowFeedback(true);
                  if (!message.correctedText) {
                    await Promise.resolve(onRequestFeedback(message.id));
                  }
                }}
                disabled={isFeedbackLoading}
                className="text-sm font-semibold text-blue-700 hover:text-blue-800 disabled:text-gray-400 flex items-center gap-1"
              >
                {showFeedback ? 'Hide Feedback' : (isFeedbackLoading ? 'Getting feedback...' : 'Get Feedback')}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  {/* chevron (keep original arrow style) */}
                  <path d="M7 10l5 5 5-5z" />
                </svg>
              </button>
            )}

            {/* Voice icon only if userAudioUrl exists */}
            {message.userAudioUrl ? (
              <UserAudioPlayer audioUrl={message.userAudioUrl} />
            ) : (
              <div />
            )}
          </div>
        </div>

        {showFeedback && message.correctedText && (
          <div className="bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 rounded-2xl px-4 py-3 max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg shadow-sm">
            <p className="text-sm font-semibold text-emerald-800 mb-1">
              ✨ Corrected:
            </p>
            <p className="text-sm text-emerald-900">
              {message.correctedText}
            </p>
            {message.explanation && (
              <ErrorExplanation
                explanation={message.explanation || ''}
                isOpen={showExplanation}
                onToggle={() => setShowExplanation(!showExplanation)}
              />
            )}
          </div>
        )}
      </div>
    );
  }

  return (
      <div className="flex flex-col items-start space-y-2">

        <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-200/60 rounded-2xl rounded-tl-sm px-4 py-3 max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg shadow-sm">
          <AudioPlayer
            audioUrl={message.audioUrl}
            text={message.aiResponseText}
            autoPlay={autoPlayAudio}
            autoPlayKey={message.id}
            onAutoplayConsumed={onAutoplayConsumed}
            onShowTranslation={async () => {
              if (!showTranslation) {
                setShowTranslation(true);
                if (message.aiResponseText && !translatedText) {
                  setIsTranslating(true);
                  try {
                    const { targetLanguage } = loadUserSettings();
                    const result = await translateText(message.aiResponseText, targetLanguage);
                    setTranslatedText(result.translatedText);
                  } catch (error) {
                    console.error('Translation error:', error);
                    setTranslatedText('Translation failed');
                  } finally {
                    setIsTranslating(false);
                  }
                }
              } else {
                setShowTranslation(false);
              }
            }}
          />
          {showTranslation && message.aiResponseText && (
            <div className="mt-2 pt-2 border-t border-gray-200">
              {isTranslating ? (
                <p className="text-xs text-gray-500">Translating...</p>
              ) : translatedText ? (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Translation:</p>
                  <p className="text-sm text-gray-700">{translatedText}</p>
                </div>
              ) : (
                <p className="text-xs text-gray-500">Click Translate to see translation</p>
              )}
            </div>
          )}
        </div>
    </div>
  );
}