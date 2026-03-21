import { useState, useRef, useEffect } from 'react';
import { speakText, stopSpeaking, getVoicesForPracticeLanguage } from '../../utils/speechSynthesis';
import { loadUserSettings, getEffectiveAiSpeakerId } from '../../utils/userSettings';
import { DEFAULT_AI_SPEAKERS, assignVoicesToSpeakers } from '../../utils/aiSpeakers';
import { waitForVoices, waitForVoicesWithRetry } from '../../utils/speechSynthesis';

// Prevent re-autoplay across remounts during a single app session
const autoPlayedTtsKeys = new Set<string>();

interface AudioPlayerProps {
  audioUrl?: string;
  text?: string;
  onShowTranslation: () => void;
  autoPlay?: boolean; // Auto-play when component mounts or text changes
  autoPlayKey?: string; // stable key (e.g., message.id) to ensure we auto-play once per message
}

export default function AudioPlayer({
  audioUrl,
  text,
  onShowTranslation,
  autoPlay = false,
  autoPlayKey,
}: AudioPlayerProps) {
  const practiceLanguage = loadUserSettings().practiceLanguage ?? 'en';
  const ttsLang = practiceLanguage === 'he' ? 'he-IL' : 'en-US';

  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [showText, setShowText] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [ttsAvailable, setTtsAvailable] = useState(false); // true when we have at least one voice for practice language
  const ttsAutoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevAutoPlayRef = useRef<boolean>(false);
  const prevTextRef = useRef<string>('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasAutoPlayedUrlRef = useRef(false);

  // Resolve voice for TTS: prefer selected AI speaker voice, then first voice for practice language (only used when ttsAvailable)
  const getVoiceForTts = (): SpeechSynthesisVoice | undefined => {
    if (selectedVoice) return selectedVoice;
    const langVoices = getVoicesForPracticeLanguage(practiceLanguage);
    return langVoices[0] || undefined;
  };

  // Load selected speaker's voice (by practice language); retry for Hebrew when voices load late after adding language
  useEffect(() => {
    const wait = practiceLanguage === 'he' ? waitForVoicesWithRetry(2000) : waitForVoices();
    wait.then((voices) => {
      const settings = loadUserSettings();
      const lang = settings.practiceLanguage ?? 'en';
      const langVoices = getVoicesForPracticeLanguage(lang);
      setTtsAvailable(langVoices.length > 0);

      const speakers = assignVoicesToSpeakers(DEFAULT_AI_SPEAKERS, voices, lang);
      const effectiveId = getEffectiveAiSpeakerId(lang, settings.aiSpeakerId);
      const speaker = speakers.find((s) => s.id === effectiveId) || speakers[0];

      if (speaker?.voiceName) {
        const voice = langVoices.find((v) => v.name === speaker.voiceName);
        setSelectedVoice(voice || langVoices[0] || null);
      } else {
        setSelectedVoice(langVoices[0] || null);
      }
    });
  }, [practiceLanguage]);

  useEffect(() => {
    return () => {
      stopSpeaking();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, []);

  // Create server audio element only when TTS is not available; when TTS is available we use selected AI speaker voice instead
  useEffect(() => {
    if (!audioUrl || ttsAvailable) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      return;
    }
    const audio = new Audio(audioUrl);
    audio.playbackRate = speed;
    audioRef.current = audio;
    const onEnded = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.pause();
      audio.src = '';
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [audioUrl, ttsAvailable]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed, audioUrl]);

  // Auto-play: TTS with selected AI speaker when available; otherwise server audio URL
  useEffect(() => {
    if (ttsAutoPlayTimerRef.current) {
      clearTimeout(ttsAutoPlayTimerRef.current);
      ttsAutoPlayTimerRef.current = null;
    }

    const key = autoPlayKey || (text || '').trim() || 'unknown';
    const autoPlayEnabledJustNow = autoPlay && !prevAutoPlayRef.current;
    const textChanged = (text || '').trim() !== prevTextRef.current;
    prevAutoPlayRef.current = !!autoPlay;
    prevTextRef.current = (text || '').trim();

    if (!autoPlay) return;
    if (!key || key === 'unknown') return;
    if (!textChanged && !autoPlayEnabledJustNow) return;
    if (autoPlayedTtsKeys.has(key)) return;

    const t = (text || '').trim();

    if (ttsAvailable && t) {
      ttsAutoPlayTimerRef.current = setTimeout(async () => {
        try {
          const isSpeaking = window.speechSynthesis.speaking ||
            (window.speechSynthesis as { pending?: boolean }).pending === true;
          if (isSpeaking) return;
          setIsPlaying(true);
          autoPlayedTtsKeys.add(key);
          await speakText({
            text: t,
            lang: ttsLang,
            rate: speed,
            voice: getVoiceForTts(),
          });
        } catch (e) {
          autoPlayedTtsKeys.delete(key);
          console.warn('WebSpeech auto-play failed (non-fatal):', e);
        } finally {
          setIsPlaying(false);
        }
      }, 450);
      return () => {
        if (ttsAutoPlayTimerRef.current) {
          clearTimeout(ttsAutoPlayTimerRef.current);
          ttsAutoPlayTimerRef.current = null;
        }
      };
    }

    if (!ttsAvailable && audioUrl) {
      hasAutoPlayedUrlRef.current = true;
      autoPlayedTtsKeys.add(key);
      const timer = setTimeout(() => {
        const audio = audioRef.current;
        if (audio && audio.src) {
          setIsPlaying(true);
          audio.playbackRate = speed;
          audio.play().catch((e) => {
            console.warn('Auto-play server audio failed (non-fatal):', e);
            autoPlayedTtsKeys.delete(key);
          });
        }
      }, 300);
      return () => clearTimeout(timer);
    }

    return () => {
      if (ttsAutoPlayTimerRef.current) {
        clearTimeout(ttsAutoPlayTimerRef.current);
        ttsAutoPlayTimerRef.current = null;
      }
    };
  }, [autoPlay, autoPlayKey, text, speed, selectedVoice, ttsLang, practiceLanguage, audioUrl, ttsAvailable]);

  const togglePlay = async () => {
    let currentSpeed = speed;
    if (currentSpeed === undefined || currentSpeed === null || isNaN(currentSpeed) || !isFinite(currentSpeed)) {
      currentSpeed = 1.0;
      setSpeed(1.0);
    }
    currentSpeed = Math.max(0.1, Math.min(10, currentSpeed));

    if (ttsAvailable && text) {
      if (isPlaying) {
        stopSpeaking();
        setIsPlaying(false);
      } else {
        const alreadySpeaking =
          window.speechSynthesis.speaking ||
          (window.speechSynthesis as { pending?: boolean }).pending === true;
        if (alreadySpeaking) return;
        try {
          setIsPlaying(true);
          if (!('speechSynthesis' in window)) {
            throw new Error('Speech synthesis is not supported in this browser.');
          }
          await speakText({
            text,
            lang: ttsLang,
            rate: currentSpeed,
            voice: getVoiceForTts(),
          });
        } catch (error: any) {
          setIsPlaying(false);
          const isInterrupted = error?.message?.includes('interrupted');
          if (!isInterrupted && !error?.message?.includes('timeout')) {
            alert(error?.message || 'Failed to play audio.');
          }
        } finally {
          setIsPlaying(false);
        }
      }
      return;
    }

    if (!ttsAvailable && audioUrl && audioRef.current) {
      const audio = audioRef.current;
      if (isPlaying) {
        audio.pause();
      } else {
        audio.playbackRate = currentSpeed;
        setIsPlaying(true);
        audio.play().catch((e) => {
          console.error('Server audio play failed:', e);
          setIsPlaying(false);
          alert('Failed to play audio. Check the URL or try again.');
        });
      }
      return;
    }

    if (!text && !(audioUrl && !ttsAvailable)) {
      console.warn('No text to play and no server audio available');
    }
  };

  const handleSpeedChange = async (newSpeed: number) => {
    if (newSpeed === undefined || newSpeed === null || isNaN(newSpeed) || !isFinite(newSpeed)) return;
    const validSpeed = Math.max(0.1, Math.min(10, newSpeed));
    setSpeed(validSpeed);

    if (audioRef.current) {
      audioRef.current.playbackRate = validSpeed;
      return;
    }

    if (text && isPlaying) {
      stopSpeaking();
      setIsPlaying(false);
      setTimeout(async () => {
        try {
          setIsPlaying(true);
          await speakText({
            text,
            lang: ttsLang,
            rate: validSpeed,
            voice: getVoiceForTts(),
          });
        } catch (error) {
          console.error('TTS error on speed change:', error);
        } finally {
          setIsPlaying(false);
        }
      }, 200);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center space-x-2 flex-wrap">
        <button
          onClick={togglePlay}
          className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center hover:from-blue-600 hover:to-blue-700 shadow-md transition-all active:scale-95"
        >
          {isPlaying ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => handleSpeedChange(0.5)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              Math.abs(speed - 0.5) < 0.01 
                ? 'bg-blue-500 text-white shadow-sm' 
                : 'bg-transparent text-gray-600 hover:bg-gray-200'
            }`}
          >
            0.5x
          </button>
          <button
            onClick={() => handleSpeedChange(1.0)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              Math.abs(speed - 1.0) < 0.01 
                ? 'bg-blue-500 text-white shadow-sm' 
                : 'bg-transparent text-gray-600 hover:bg-gray-200'
            }`}
          >
            1x
          </button>
          <button
            onClick={() => handleSpeedChange(1.5)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              Math.abs(speed - 1.5) < 0.01
                ? 'bg-blue-500 text-white shadow-sm'
                : 'bg-transparent text-gray-600 hover:bg-gray-200'
            }`}
          >
            1.5x
          </button>
        </div>
        <button
          onClick={() => setShowText(!showText)}
          className="text-xs text-gray-600 hover:text-gray-900 font-medium px-2 py-1 rounded-md hover:bg-gray-100 transition-colors"
        >
          {showText ? 'Hide text' : 'Show text'}
        </button>
        <button
          onClick={onShowTranslation}
          className="text-xs text-gray-600 hover:text-gray-900 font-medium px-2 py-1 rounded-md hover:bg-gray-100 transition-colors"
        >
          Translate
        </button>
      </div>
      {showText && text && (
        <p className="text-sm text-gray-700 mt-2 leading-relaxed">{text}</p>
      )}
    </div>
  );
}
