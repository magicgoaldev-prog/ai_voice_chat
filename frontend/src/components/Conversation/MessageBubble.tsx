import { useState, useRef, useEffect } from 'react';
import AudioPlayer from './AudioPlayer';
import ErrorExplanation from './ErrorExplanation';
import { Message } from '../../types';
import { translateText } from '../../services/api';

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
      className="w-8 h-8 rounded-full bg-indigo-700 hover:bg-indigo-800 text-white flex items-center justify-center flex-shrink-0"
      aria-label={isPlaying ? 'Pause recording' : 'Play recording'}
    >
      {isPlaying ? '⏸' : '▶'}
    </button>
  );
}

interface MessageBubbleProps {
  message: Message;
  isNewMessage?: boolean; // Indicates if this is a newly added message
}

export default function MessageBubble({ message, isNewMessage = false }: MessageBubbleProps) {
  const [showExplanation, setShowExplanation] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  
  // Debug logging
  useEffect(() => {
    if (message.type === 'ai' && isNewMessage) {
      console.log('🎵 New AI message detected for auto-play:', {
        messageId: message.id,
        text: message.aiResponseText?.substring(0, 50),
        isNewMessage
      });
    }
  }, [message.id, message.type, isNewMessage, message.aiResponseText]);

  if (message.type === 'user') {
    return (
      <div className="flex flex-col items-end space-y-2">
        <div className="bg-indigo-600 text-white rounded-lg px-4 py-2 max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg">
          <div className="flex items-center gap-2">
            {message.userAudioUrl && (
              <UserAudioPlayer audioUrl={message.userAudioUrl} />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">You said:</p>
              {message.transcription && (
                <p className="text-xs text-indigo-200 mt-1 break-words whitespace-pre-wrap">
                  {message.transcription}
                </p>
              )}
              {!message.transcription && (
                <p className="text-xs text-indigo-200 mt-1 italic">(No transcription available)</p>
              )}
            </div>
          </div>
        </div>
        {message.correctedText && message.correctedText !== message.transcription && (
          <div className="bg-green-100 border border-green-300 rounded-lg px-4 py-2 max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg">
            <p className="text-sm font-semibold text-green-800">
              Corrected: {message.correctedText}
            </p>
            {message.explanation && (
              <ErrorExplanation
                explanation={message.explanation}
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
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg">
        <AudioPlayer
          audioUrl={message.audioUrl}
          text={message.aiResponseText}
          autoPlay={isNewMessage && message.type === 'ai'} // Auto-play new AI messages
          onShowTranslation={async () => {
            if (!showTranslation) {
              setShowTranslation(true);
              if (message.aiResponseText && !translatedText) {
                setIsTranslating(true);
                try {
                  const result = await translateText(message.aiResponseText, 'ko');
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
