import { useState, useRef, useEffect } from 'react';
import { speakText, stopSpeaking, getEnglishVoices } from '../../utils/speechSynthesis';
import { loadUserSettings } from '../../utils/userSettings';
import { DEFAULT_AI_SPEAKERS, assignVoicesToSpeakers } from '../../utils/aiSpeakers';
import { waitForVoices } from '../../utils/speechSynthesis';

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
  audioUrl: _audioUrl,
  text,
  onShowTranslation,
  autoPlay = false,
  autoPlayKey,
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [showText, setShowText] = useState(true); // Default to showing text
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const ttsAutoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevAutoPlayRef = useRef<boolean>(false);
  const prevTextRef = useRef<string>('');

  // Load selected speaker's voice
  useEffect(() => {
    waitForVoices().then((voices) => {
      const settings = loadUserSettings();
      const speakers = assignVoicesToSpeakers(DEFAULT_AI_SPEAKERS, voices);
      const speaker = speakers.find((s) => s.id === settings.aiSpeakerId) || speakers[0];
      
      if (speaker?.voiceName) {
        const englishVoices = getEnglishVoices();
        const voice = englishVoices.find((v) => v.name === speaker.voiceName);
        setSelectedVoice(voice || null);
      }
    });
  }, []);

  useEffect(() => {
    // Cleanup any active TTS on unmount
    return () => {
      stopSpeaking();
    };
  }, []);

  // Auto-play via Web Speech API TTS (fast, no server wait)
  useEffect(() => {
    if (ttsAutoPlayTimerRef.current) {
      clearTimeout(ttsAutoPlayTimerRef.current);
      ttsAutoPlayTimerRef.current = null;
    }

    const t = (text || '').trim();
    const key = autoPlayKey || t;
    const autoPlayEnabledJustNow = autoPlay && !prevAutoPlayRef.current;
    const textChanged = t !== prevTextRef.current;
    prevAutoPlayRef.current = !!autoPlay;
    prevTextRef.current = t;

    if (!autoPlay) return;
    if (!t) return;
    if (!key) return;
    if (!textChanged && !autoPlayEnabledJustNow) return;
    if (autoPlayedTtsKeys.has(key)) return;

    // Debounce a bit so streaming doesn't speak partial fragments
    ttsAutoPlayTimerRef.current = setTimeout(async () => {
      try {
        const isSpeaking = window.speechSynthesis.speaking ||
          (window.speechSynthesis as { pending?: boolean }).pending === true;
        if (isSpeaking) {
          return;
        }
        setIsPlaying(true);
        autoPlayedTtsKeys.add(key);
        await speakText({ 
          text: t, 
          lang: 'en-US', 
          rate: speed,
          voice: selectedVoice || undefined,
        });
      } catch (e) {
        // allow retry on next update
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
  }, [autoPlay, autoPlayKey, text, speed, selectedVoice]);

  const togglePlay = async () => {
    // Use current speed state
    // This ensures the speed button selection is respected
    let currentSpeed = speed;
    
    // Validate speed value
    if (currentSpeed === undefined || currentSpeed === null || isNaN(currentSpeed) || !isFinite(currentSpeed)) {
      console.warn('Invalid speed value, using default 1.0:', currentSpeed);
      currentSpeed = 1.0;
      setSpeed(1.0); // Reset to valid value
    }
    
    // Clamp speed to valid range
    currentSpeed = Math.max(0.1, Math.min(10, currentSpeed));
    
    console.log('▶️ Toggle play:', { isPlaying, speed: currentSpeed, hasText: !!text });

    // Always use Web Speech API TTS for manual play (consistent voice, avoids mp3 delays).
    if (!text) {
      console.warn('No text to play');
      return;
    }

    if (isPlaying) {
      stopSpeaking();
      setIsPlaying(false);
    } else {
      try {
        setIsPlaying(true);
        console.log('🎵 Starting TTS playback:', { 
          text: text.substring(0, 50), 
          speed: currentSpeed,
          textLength: text.length,
          speedState: speed
        });
        
        // Check if speechSynthesis is available
        if (!('speechSynthesis' in window)) {
          throw new Error('Speech synthesis is not supported in this browser. Please use Chrome, Edge, or Safari.');
        }
        
        await speakText({
          text: text,
          lang: 'en-US',
          rate: currentSpeed, // Use the current speed state
          voice: selectedVoice || undefined,
        });
        console.log('✅ TTS playback completed');
        setIsPlaying(false);
      } catch (error: any) {
        console.error('❌ TTS error in AudioPlayer:', {
          error: error,
          message: error?.message,
          name: error?.name,
          text: text.substring(0, 50),
        });
        setIsPlaying(false);
        
        // Provide more specific error message
        let errorMessage = 'Failed to play audio. ';
        if (error?.message?.includes('not supported')) {
          errorMessage = 'Speech synthesis is not supported in this browser. Please use Chrome, Edge, or Safari.';
        } else if (error?.message?.includes('error')) {
          errorMessage = `Speech synthesis error: ${error.message}`;
        } else if (error?.message) {
          errorMessage = error.message;
        } else {
          errorMessage += 'Please try again. If the problem persists, try refreshing the page.';
        }
        
        // Only show alert for critical errors; skip for timeout and interrupted
        const isInterrupted = error?.message?.includes('interrupted');
        if (isInterrupted) {
          console.warn('TTS was interrupted by another playback (no alert)');
        } else if (!error?.message?.includes('timeout')) {
          alert(errorMessage);
        } else {
          console.warn('TTS timeout, but continuing...');
        }
      }
    }
  };

  const handleSpeedChange = async (newSpeed: number) => {
    // Validate newSpeed
    if (newSpeed === undefined || newSpeed === null || isNaN(newSpeed) || !isFinite(newSpeed)) {
      console.warn('Invalid speed value:', newSpeed);
      return;
    }
    
    // Clamp to valid range
    const validSpeed = Math.max(0.1, Math.min(10, newSpeed));
    
    console.log('🔧 Speed change requested:', { from: speed, to: validSpeed, isPlaying, hasText: !!text });
    
    // Update speed state immediately - this is critical
    setSpeed(validSpeed);
    
    // For Web Speech API
    if (text) {
      if (isPlaying) {
        // If currently playing, stop and restart with new speed
        console.log('🔄 Restarting TTS with new speed:', validSpeed);
        stopSpeaking();
        setIsPlaying(false);
        
        // Wait a moment for cleanup, then restart with new speed
        setTimeout(async () => {
          try {
            setIsPlaying(true);
            await speakText({
              text: text,
              lang: 'en-US',
              rate: validSpeed, // Use validated speed
            });
            setIsPlaying(false);
            console.log('✅ TTS restarted with new speed:', validSpeed);
          } catch (error) {
            console.error('❌ TTS error on speed change:', error);
            setIsPlaying(false);
          }
        }, 200);
      } else {
        // If not playing, just update the speed state - it will be used on next play
        console.log('💾 Speed updated for next play:', validSpeed);
      }
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
            onClick={() => handleSpeedChange(2.0)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              Math.abs(speed - 2.0) < 0.01 
                ? 'bg-blue-500 text-white shadow-sm' 
                : 'bg-transparent text-gray-600 hover:bg-gray-200'
            }`}
          >
            2x
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
