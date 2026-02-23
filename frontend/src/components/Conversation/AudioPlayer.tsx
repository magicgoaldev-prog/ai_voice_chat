import { useState, useRef, useEffect } from 'react';
import { Howl } from 'howler';
import { speakText, stopSpeaking } from '../../utils/speechSynthesis';

interface AudioPlayerProps {
  audioUrl?: string;
  text?: string;
  onShowTranslation: () => void;
  autoPlay?: boolean; // Auto-play when component mounts or text changes
}

export default function AudioPlayer({ audioUrl, text, onShowTranslation, autoPlay = false }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [showText, setShowText] = useState(true); // Default to showing text
  const howlRef = useRef<Howl | null>(null);

  useEffect(() => {
    if (audioUrl && howlRef.current) {
      howlRef.current.unload();
    }

    if (audioUrl) {
      howlRef.current = new Howl({
        src: [audioUrl],
        html5: true,
        rate: speed,
        onend: () => setIsPlaying(false),
      });
    }

    return () => {
      if (howlRef.current) {
        howlRef.current.unload();
      }
      stopSpeaking();
    };
  }, [audioUrl, speed]);

  // Auto-play when text changes and autoPlay is true
  const hasAutoPlayedRef = useRef<string | null>(null);
  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevAutoPlayRef = useRef<boolean>(false);
  const prevTextRef = useRef<string | undefined>(undefined);
  
  useEffect(() => {
    // Clear any existing timer
    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }
    
    // Check if conditions are met for auto-play
    const hasText = !!text && text.trim().length > 0;
    const shouldAutoPlay = autoPlay && hasText && !audioUrl;
    const textChanged = text !== prevTextRef.current;
    const autoPlayEnabled = autoPlay && !prevAutoPlayRef.current;
    
    // Update refs
    prevTextRef.current = text;
    prevAutoPlayRef.current = autoPlay || false;
    
    // Auto-play if:
    // 1. autoPlay is true
    // 2. text exists and changed
    // 3. no audioUrl
    // 4. hasn't been played yet for this text
    if (shouldAutoPlay && (textChanged || autoPlayEnabled) && text !== hasAutoPlayedRef.current) {
      // Mark this text as played immediately to prevent duplicate calls
      hasAutoPlayedRef.current = text;
      
      console.log('🎵 Auto-play triggered:', { 
        text: text.substring(0, 50),
        autoPlay,
        textChanged,
        autoPlayEnabled,
        currentSpeed: speed
      });
      
      // Small delay to ensure component is fully rendered and scrolled
      autoPlayTimerRef.current = setTimeout(async () => {
        // Double-check conditions before playing
        if (!text || text !== hasAutoPlayedRef.current) {
          console.log('⏭️ Auto-play cancelled - text changed');
          hasAutoPlayedRef.current = null; // Reset so it can retry
          return;
        }
        
        try {
          // Use current speed state (default 1.0)
          let currentSpeed = speed;
          if (currentSpeed === undefined || currentSpeed === null || isNaN(currentSpeed) || !isFinite(currentSpeed)) {
            currentSpeed = 1.0;
            setSpeed(1.0);
          }
          currentSpeed = Math.max(0.1, Math.min(10, currentSpeed));
          
          setIsPlaying(true);
          console.log('🎵 Auto-playing TTS:', { 
            text: text.substring(0, 50), 
            speed: currentSpeed,
            autoPlay: autoPlay
          });
          
          await speakText({
            text: text,
            lang: 'en-US',
            rate: currentSpeed,
          });
          
          console.log('✅ Auto-play TTS completed');
          setIsPlaying(false);
        } catch (error: any) {
          console.error('❌ Auto-play TTS error:', error);
          setIsPlaying(false);
          // Reset on error so it can retry
          hasAutoPlayedRef.current = null;
        }
        autoPlayTimerRef.current = null;
      }, 300); // Reduced delay to 300ms for faster response
    } else if (shouldAutoPlay && text === hasAutoPlayedRef.current) {
      console.log('⏭️ Skipping auto-play - already played:', {
        text: text?.substring(0, 50)
      });
    } else if (!shouldAutoPlay) {
      console.log('⏭️ Auto-play conditions not met:', {
        autoPlay,
        hasText,
        hasAudioUrl: !!audioUrl
      });
    }

    return () => {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
    };
  }, [text, autoPlay, audioUrl, speed]); // Include speed to use current speed

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
    
    // If audioUrl exists, use Howler (for backward compatibility)
    if (audioUrl && howlRef.current) {
      if (isPlaying) {
        howlRef.current.pause();
      } else {
        // Update rate before playing
        howlRef.current.rate(currentSpeed);
        howlRef.current.play();
      }
      setIsPlaying(!isPlaying);
      return;
    }

    // Otherwise, use Web Speech API TTS
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
        
        // Only show alert for critical errors, not for minor issues
        if (!error?.message?.includes('timeout')) {
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
    
    // If using Howler (audioUrl exists)
    if (audioUrl && howlRef.current) {
      if (isPlaying) {
        howlRef.current.rate(validSpeed);
        console.log('✅ Speed changed for Howler audio (playing)');
      } else {
        // Update rate for next play
        howlRef.current.rate(validSpeed);
        console.log('💾 Speed updated for Howler audio (next play)');
      }
      return;
    }
    
    // For Web Speech API
    if (!audioUrl && text) {
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
