import { useState, useRef, useEffect } from 'react';

interface UseSpeechRecognitionOptions {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
}

export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}) {
  const {
    language = 'en-US',
    continuous = true,
    interimResults = false,
    onResult,
    onError,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const shouldRestartRef = useRef<boolean>(true); // Track if we should auto-restart
  const noSpeechErrorCountRef = useRef<number>(0); // Track consecutive no-speech errors

  useEffect(() => {
    // Check browser support
    const SpeechRecognition = 
      (window as any).SpeechRecognition || 
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.lang = language;

    recognition.onstart = () => {
      console.log('✅ Speech recognition started successfully');
      console.log('Recognition state:', {
        continuous: recognition.continuous,
        interimResults: recognition.interimResults,
        lang: recognition.lang,
      });
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Reset no-speech error count when we get results
      noSpeechErrorCountRef.current = 0;
      
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      const fullTranscript = finalTranscript || interimTranscript;
      const trimmedTranscript = fullTranscript.trim();
      
      console.log('✅ Speech recognition result:', {
        interim: interimTranscript,
        final: finalTranscript,
        full: trimmedTranscript,
        resultIndex: event.resultIndex,
        resultsLength: event.results.length
      });
      
      setTranscript(trimmedTranscript);

      if (onResult) {
        onResult(trimmedTranscript, finalTranscript.length > 0);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      let errorMessage = 'Speech recognition error occurred.';
      
      // Detailed error logging for debugging
      console.error('Speech Recognition Error Event:', {
        error: event.error,
        message: event.message || 'No message',
        timeStamp: event.timeStamp,
        type: event.type,
      });
      
      switch (event.error) {
        case 'no-speech':
          // In continuous mode, no-speech is common and should auto-restart
          if (continuous) {
            noSpeechErrorCountRef.current++;
            console.log(`No speech detected (count: ${noSpeechErrorCountRef.current}) - continuing in continuous mode...`);
            
            // Only show error if it happens multiple times in a row (5+ times)
            if (noSpeechErrorCountRef.current < 5) {
              // Don't set error or stop listening, let it auto-restart
              return; // Exit early, don't set error or stop listening
            }
            // After 5 consecutive no-speech errors, show warning but continue
            console.warn('Multiple no-speech errors detected, but continuing...');
            errorMessage = 'No speech detected multiple times. Please speak clearly.';
            // Still don't stop listening in continuous mode
            setError(errorMessage);
            if (onError) {
              onError(errorMessage);
            }
            return; // Don't stop listening
          }
          errorMessage = 'No speech detected. Please try again.';
          break;
        case 'aborted':
          errorMessage = 'Speech recognition was aborted.';
          console.log('Speech recognition aborted (likely intentional)');
          // Don't show error for aborted (usually intentional)
          setIsListening(false);
          return;
        case 'audio-capture':
          errorMessage = 'No microphone found. Please check your microphone.';
          break;
        case 'network':
          errorMessage = 'Network error occurred. Please check your internet connection.';
          console.error('Network error - Web Speech API requires internet connection');
          break;
        case 'not-allowed':
          errorMessage = 'Microphone permission denied. Please allow microphone access.';
          break;
        case 'service-not-allowed':
          errorMessage = 'Speech recognition service not allowed. Please check browser settings.';
          break;
        default:
          errorMessage = `Speech recognition error: ${event.error}`;
      }

      // Reset no-speech error count for other errors
      if (event.error !== 'no-speech') {
        noSpeechErrorCountRef.current = 0;
      }

      setError(errorMessage);
      setIsListening(false);
      
      if (onError) {
        onError(errorMessage);
      }
    };

    recognition.onend = () => {
      console.log('Speech recognition ended', {
        shouldRestart: shouldRestartRef.current,
        continuous: continuous,
      });
      setIsListening(false);
      
      // If continuous mode and we should restart, restart automatically
      if (continuous && shouldRestartRef.current && recognitionRef.current) {
        // Small delay before restarting to avoid immediate restart
        setTimeout(() => {
          if (recognitionRef.current && shouldRestartRef.current) {
            try {
              console.log('Auto-restarting speech recognition...');
              recognitionRef.current.start();
            } catch (error: any) {
              // Log restart errors for debugging
              console.warn('Could not restart speech recognition:', {
                error: error.message,
                name: error.name,
                shouldRestart: shouldRestartRef.current,
              });
            }
          }
        }, 100);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [language, continuous, interimResults, onResult, onError]);

  const startListening = () => {
    if (!recognitionRef.current) {
      const errorMsg = 'Speech recognition is not available. Please use Chrome, Edge, or Safari.';
      setError(errorMsg);
      if (onError) {
        onError(errorMsg);
      }
      return;
    }

    // If already listening, abort first to ensure clean state
    if (isListening) {
      console.log('Speech recognition is already listening, aborting first...');
      recognitionRef.current.abort();
      // Wait a moment for cleanup, then start
      setTimeout(() => {
        try {
          shouldRestartRef.current = true;
          noSpeechErrorCountRef.current = 0;
          setTranscript('');
          setError(null);
          recognitionRef.current?.start();
          console.log('🎤 Speech recognition restarted after abort');
        } catch (error: any) {
          console.error('Failed to restart speech recognition:', error);
        }
      }, 100);
      return;
    }

    try {
      shouldRestartRef.current = true; // Allow auto-restart
      noSpeechErrorCountRef.current = 0; // Reset error count
      setTranscript('');
      setError(null);
      recognitionRef.current.start();
      console.log('🎤 Speech recognition start() called');
    } catch (error: any) {
      // If error is "already started", try aborting and restarting
      if (error.message?.includes('already') || error.name === 'InvalidStateError') {
        console.log('Speech recognition appears to be running, aborting and restarting...');
        recognitionRef.current.abort();
        setTimeout(() => {
          try {
            shouldRestartRef.current = true;
            noSpeechErrorCountRef.current = 0;
            setTranscript('');
            setError(null);
            recognitionRef.current?.start();
            console.log('🎤 Speech recognition restarted after error recovery');
          } catch (retryError: any) {
            const errorMsg = `Failed to start speech recognition: ${retryError.message}`;
            console.error(errorMsg, retryError);
            setError(errorMsg);
            if (onError) {
              onError(errorMsg);
            }
          }
        }, 100);
        return;
      }
      
      const errorMsg = `Failed to start speech recognition: ${error.message}`;
      console.error(errorMsg, error);
      setError(errorMsg);
      if (onError) {
        onError(errorMsg);
      }
    }
  };

  const stopListening = () => {
    shouldRestartRef.current = false; // Prevent auto-restart
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  };

  const abort = () => {
    shouldRestartRef.current = false; // Prevent auto-restart
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }
  };

  return {
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    abort,
  };
}
