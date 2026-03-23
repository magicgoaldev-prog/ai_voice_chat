import { useState, useRef, useEffect, useCallback } from 'react';

// Dedupe autoplay per session (persists across remounts until full page reload)
const autoPlayedKeys = new Set<string>();

interface AudioPlayerProps {
  audioUrl?: string; // Server-generated MP3 blob URL
  text?: string; // Text shown under the player
  onShowTranslation: () => void;
  autoPlay?: boolean;
  autoPlayKey?: string;
  onAutoplayConsumed?: () => void;
}

export default function AudioPlayer({
  audioUrl,
  text,
  onShowTranslation,
  autoPlay = false,
  autoPlayKey,
  onAutoplayConsumed,
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed,     setSpeed]     = useState(1.0);
  const [showText,  setShowText]  = useState(true);

  const audioRef      = useRef<HTMLAudioElement | null>(null);
  const autoPlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef  = useRef(false);

  // Create / replace <audio> element
  useEffect(() => {
    unmountedRef.current = false;

    if (!audioUrl) {
      setIsPlaying(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      return;
    }

    // Reset UI when swapping src (blob → https, retries, etc.) so we never stick on "pause" icon
    setIsPlaying(false);

    // Tear down previous element
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }

    const audio = new Audio(audioUrl);
    audio.playbackRate = speed;
    audioRef.current = audio;

    const onPlay  = () => { if (!unmountedRef.current) setIsPlaying(true);  };
    const onPause = () => { if (!unmountedRef.current) setIsPlaying(false); };
    const onEnded = () => { if (!unmountedRef.current) setIsPlaying(false); };
    const onError = () => { if (!unmountedRef.current) setIsPlaying(false); };
    const onEmptied = () => { if (!unmountedRef.current) setIsPlaying(false); };
    // Some browsers skip `ended` on truncated or odd MP3 metadata; keep UI in sync
    const onTimeUpdate = () => {
      if (unmountedRef.current) return;
      if (audio.ended) {
        setIsPlaying(false);
        return;
      }
      const d = audio.duration;
      if (Number.isFinite(d) && d > 0 && audio.currentTime >= d - 0.05) {
        setIsPlaying(false);
      }
    };

    audio.addEventListener('play',  onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.addEventListener('emptied', onEmptied);
    audio.addEventListener('timeupdate', onTimeUpdate);

    return () => {
      audio.removeEventListener('play',  onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('emptied', onEmptied);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.pause();
      audio.src = '';
      if (audioRef.current === audio) audioRef.current = null;
    };
  // playbackRate is synced in a separate effect
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  // Keep playbackRate in sync with state
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  // Cleanup on unmount
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (autoPlayTimer.current) clearTimeout(autoPlayTimer.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, []);

  // Autoplay: debounce 400ms after audioUrl is available
  useEffect(() => {
    if (!autoPlay)    return;
    if (!autoPlayKey) return;
    if (autoPlayedKeys.has(autoPlayKey)) return;
    if (!audioUrl) return; // Wait until server audio exists

    if (autoPlayTimer.current) clearTimeout(autoPlayTimer.current);

    autoPlayTimer.current = setTimeout(() => {
      autoPlayTimer.current = null;
      if (unmountedRef.current)            return;
      if (!autoPlay)                       return;
      if (autoPlayedKeys.has(autoPlayKey)) return;
      if (!audioRef.current)               return;

      autoPlayedKeys.add(autoPlayKey);
      onAutoplayConsumed?.();

      audioRef.current.currentTime = 0;
      audioRef.current.playbackRate = speed;
      audioRef.current.play().catch(() => {
        // Autoplay blocked by policy, etc. — user can press play
      });
    }, 400);

    return () => {
      if (autoPlayTimer.current) { clearTimeout(autoPlayTimer.current); autoPlayTimer.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, autoPlayKey, audioUrl]);

  // Manual play / pause
  const togglePlay = useCallback(() => {
    if (autoPlayTimer.current) { clearTimeout(autoPlayTimer.current); autoPlayTimer.current = null; }
    if (autoPlayKey) autoPlayedKeys.add(autoPlayKey);

    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.currentTime = 0;
      audio.playbackRate = speed;
      audio.play().catch(() => setIsPlaying(false));
    }
  }, [isPlaying, speed, autoPlayKey]);

  // Speed presets
  const handleSpeedChange = useCallback((newSpeed: number) => {
    setSpeed(newSpeed);
    if (audioRef.current) audioRef.current.playbackRate = newSpeed;
  }, []);

  // Render
  return (
    <div className="space-y-2">
      <div className="flex items-center space-x-2 flex-wrap">
        <button
          onClick={togglePlay}
          disabled={!audioUrl}
          className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center hover:from-blue-600 hover:to-blue-700 shadow-md transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isPlaying ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6"  y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
          {([0.5, 1.0, 1.5] as const).map(s => (
            <button
              key={s}
              onClick={() => handleSpeedChange(s)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                Math.abs(speed - s) < 0.01
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-transparent text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s === 1.0 ? '1x' : `${s}x`}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowText(v => !v)}
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

      {/* Waiting for audio URL */}
      {!audioUrl && text && (
        <p className="text-xs text-gray-400 mt-1">⏳ Loading audio...</p>
      )}
    </div>
  );
}