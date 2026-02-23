import { useState, useRef, useEffect, useCallback } from 'react';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { sendTextMessage } from '../../services/api';
import { speakText } from '../../utils/speechSynthesis';
import { Message } from '../../types';
import { 
  requiresHTTPS, 
  isMobile, 
  checkMicrophonePermission, 
  getMicrophonePermissionInstructions 
} from '../../utils/permissionHelper';
import { runSpeechDiagnostics, logDiagnostics } from '../../utils/speechDiagnostics';

interface RecordButtonProps {
  conversationId?: string;
  messages?: Message[];
  onMessageSent: (message: Message) => void;
  onProcessingChange: (processing: boolean) => void;
}

export default function RecordButton({
  conversationId,
  messages = [],
  onMessageSent,
  onProcessingChange,
}: RecordButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  const finalTranscriptRef = useRef<string>(''); // Use ref to accumulate final transcripts
  const isProcessingRef = useRef(false);
  const stopRecordingRef = useRef<(() => Promise<void>) | null>(null);
  const { startRecording: startAudioRecording, stopRecording: stopAudioRecording } = useAudioRecorder();

  const { 
    isListening, 
    transcript, 
    error: speechError,
    startListening, 
    stopListening,
    abort: abortSpeech
  } = useSpeechRecognition({
    language: 'en-US',
    continuous: true,
    interimResults: true,
    onResult: (text, isFinal) => {
      if (isFinal) {
        // Accumulate final transcripts instead of replacing
        finalTranscriptRef.current += (finalTranscriptRef.current ? ' ' : '') + text.trim();
        setFinalTranscript(finalTranscriptRef.current);
        console.log('📝 Final transcript accumulated:', finalTranscriptRef.current);
      }
    },
    onError: (error) => {
      console.error('Speech recognition error:', error);
      if (isRecording) {
        handleStopRecording();
      }
    },
  });

  const handleStopRecording = useCallback(async () => {
    if (!isRecording || isProcessingRef.current) return;
    
    setIsRecording(false);
    isProcessingRef.current = true;
    
    // Stop speech recognition
    stopListening();
    abortSpeech();
    
    // Stop audio recording for playback
    const audioBlob = await stopAudioRecording();
    
    // Get final transcript - use accumulated final transcript or current transcript
    const textToSend = finalTranscriptRef.current || finalTranscript || transcript || '';
    
    if (!textToSend.trim()) {
      // No text recognized, silently ignore
      isProcessingRef.current = false;
      if (audioBlob) {
        URL.revokeObjectURL(URL.createObjectURL(audioBlob));
      }
      return;
    }
    
    // Reset accumulated transcript for next recording
    finalTranscriptRef.current = '';

    // Create blob URL for user audio playback if available
    const userAudioUrl = audioBlob ? URL.createObjectURL(audioBlob) : undefined;

    onProcessingChange(true);
    try {
      // Build conversation history from previous messages (last 10 messages for context)
      const conversationHistory = messages
        .slice(-10) // Get last 10 messages for context
        .map((msg) => {
          if (msg.type === 'user') {
            return {
              role: 'user' as const,
              content: msg.transcription || msg.correctedText || '',
            };
          } else {
            return {
              role: 'assistant' as const,
              content: msg.aiResponseText || '',
            };
          }
        })
        .filter((msg) => msg.content.trim().length > 0); // Remove empty messages
      
      console.log('📝 Sending message with conversation history:', {
        currentText: textToSend,
        historyLength: conversationHistory.length,
        history: conversationHistory.map(m => ({ role: m.role, content: m.content.substring(0, 30) + '...' })),
      });
      
      const response = await sendTextMessage(textToSend, conversationId, conversationHistory);
      
      // Create user message with unique timestamp to ensure order
      const now = Date.now();
      const userMessage: Message = {
        id: `user_${now}`,
        conversationId: conversationId || 'temp',
        type: 'user',
        transcription: textToSend, // Use the actual text the user said, not the response transcription
        correctedText: response.correctedText,
        explanation: response.explanation,
        userAudioUrl: userAudioUrl,
        createdAt: new Date(now).toISOString(),
      };

      // Create AI message with slightly later timestamp to ensure it comes after user message
      const aiMessage: Message = {
        id: `ai_${now + 1}`,
        conversationId: conversationId || 'temp',
        type: 'ai',
        aiResponseText: response.aiResponseText,
        // TTS will be handled by frontend, no audioUrl needed
        createdAt: new Date(now + 1).toISOString(),
      };

      // Send messages in order
      onMessageSent(userMessage);
      // Small delay to ensure user message appears first
      setTimeout(() => {
        onMessageSent(aiMessage);
        // TTS will be handled automatically by AudioPlayer's autoPlay feature
        // No need to manually call speakText here
      }, 50);
      
      // After TTS completes, ensure clean state for next recording
      // The speech recognition will be ready when user presses the button again
      console.log('✅ Message processing complete, ready for next recording');
    } catch (error: any) {
      console.error('Failed to send message:', error);
      const errorMessage = error?.message || 'Failed to process your message. Please try again.';
      alert(errorMessage);
      // Clean up blob URL on error
      if (userAudioUrl) {
        URL.revokeObjectURL(userAudioUrl);
      }
    } finally {
      onProcessingChange(false);
      isProcessingRef.current = false;
      setFinalTranscript('');
      finalTranscriptRef.current = ''; // Reset accumulated transcript
      
      // Reset transcript state to ensure clean state for next recording
      // This is important for continuous conversations
      setTimeout(() => {
        setFinalTranscript('');
        finalTranscriptRef.current = '';
        console.log('🔄 State reset for next recording');
      }, 100);
    }
  }, [isRecording, finalTranscript, transcript, stopListening, abortSpeech, stopAudioRecording, onMessageSent, onProcessingChange]);

  // Store the latest handleStopRecording in ref
  useEffect(() => {
    stopRecordingRef.current = handleStopRecording;
  }, [handleStopRecording]);

  // Sync recording state
  useEffect(() => {
    setIsRecording(isListening);
  }, [isListening]);

  // Add global mouse/touch event listeners for Telegram-like behavior
  useEffect(() => {
    if (!isRecording) return;

    const handleGlobalMouseUp = () => {
      if (isRecording && !isProcessingRef.current && stopRecordingRef.current) {
        stopRecordingRef.current();
      }
    };

    const handleGlobalTouchEnd = () => {
      if (isRecording && !isProcessingRef.current && stopRecordingRef.current) {
        stopRecordingRef.current();
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchend', handleGlobalTouchEnd);

    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [isRecording]);

  const handleStartRecording = async () => {
    if (isProcessingRef.current) return;
    
    try {
      // Run diagnostics on first attempt (for debugging)
      if (!isRecording) {
        console.log('🔍 Running speech recognition diagnostics...');
        const diagnostics = await runSpeechDiagnostics();
        logDiagnostics(diagnostics);
        
        // If critical issues found, show them
        if (diagnostics.errors.length > 0 && 
            diagnostics.errors.some(e => e.includes('not supported') || e.includes('Permission'))) {
          const errorSummary = diagnostics.errors.join('\n');
          console.error('Critical issues detected:', errorSummary);
        }
      }

      // Check HTTPS requirement (only for mobile devices on non-localhost)
      if (requiresHTTPS()) {
        const message = 
          '⚠️ HTTPS Required\n\n' +
          'Mobile browsers require HTTPS for microphone access (except localhost).\n\n' +
          'Please access this app via HTTPS (https://) instead of HTTP.\n\n' +
          'For development, you can use:\n' +
          '- ngrok: ngrok http 3000\n' +
          '- localtunnel: npx localtunnel --port 3000\n' +
          '- Or use localhost on desktop browser (HTTP works)\n' +
          '- Or deploy to a server with HTTPS';
        alert(message);
        return;
      }

      // Check microphone permission first
      const permissionCheck = await checkMicrophonePermission();
      if (!permissionCheck.granted) {
        const instructions = getMicrophonePermissionInstructions();
        const message = 
          `❌ Microphone Permission Required\n\n${permissionCheck.error || 'Please allow microphone access.'}\n\n${instructions}`;
        alert(message);
        return;
      }

      // Start both speech recognition and audio recording
      setFinalTranscript('');
      finalTranscriptRef.current = ''; // Reset accumulated transcript
      
      // Check if speech recognition is supported
      const SpeechRecognition = 
        (window as any).SpeechRecognition || 
        (window as any).webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        alert('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
        return;
      }

      console.log('🎤 Starting speech recognition and audio recording...');
      
      // Ensure speech recognition is stopped before starting (to avoid conflicts)
      if (isListening) {
        console.log('Stopping existing speech recognition before restart...');
        stopListening();
        abortSpeech();
        // Wait a bit for cleanup
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Start speech recognition first
      startListening();
      
      // Then start audio recording
      await startAudioRecording();
      
      console.log('✅ Recording started - both speech recognition and audio recording');
    } catch (error: any) {
      console.error('❌ Failed to start recording:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });
      
      let errorMessage = error.message || 'Please allow microphone access.';
      
      // Provide more specific error messages
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        const instructions = getMicrophonePermissionInstructions();
        errorMessage = `Microphone permission denied.\n\n${instructions}`;
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorMessage = 'No microphone found. Please connect a microphone and try again.';
      } else if (error.name === 'NotSupportedError') {
        errorMessage = 'Microphone access is not supported in this browser.';
      }
      
      alert(`Failed to start recording: ${errorMessage}`);
      stopListening();
      abortSpeech();
    }
  };

  // Show speech recognition error to user
  useEffect(() => {
    if (speechError) {
      // Ignore "no-speech" errors in continuous mode (they're handled automatically)
      if (speechError.includes('No speech detected')) {
        console.log('No speech detected - this is normal in continuous mode, ignoring...');
        // Don't show alert or stop recording for no-speech
        return;
      }
      
      console.error('Speech recognition error:', speechError);
      
      // Show important errors to user
      if (speechError.includes('not supported') || 
          speechError.includes('permission denied') ||
          speechError.includes('microphone') ||
          speechError.includes('network')) {
        alert(speechError);
      }
      
      // If error occurs during recording, stop it (except no-speech)
      if (isRecording && !speechError.includes('No speech detected')) {
        setIsRecording(false);
        stopListening();
        abortSpeech();
      }
    }
  }, [speechError, isRecording, stopListening, abortSpeech]);

  // Telegram-style microphone icon SVG
  const MicrophoneIcon = ({ isRecording }: { isRecording: boolean }) => (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="transition-all"
    >
      {isRecording ? (
        // Recording state - square stop icon
        <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
      ) : (
        // Normal state - microphone icon
        <>
          <path
            d="M12 2C10.34 2 9 3.34 9 5V11C9 12.66 10.34 14 12 14C13.66 14 15 12.66 15 11V5C15 3.34 13.66 2 12 2Z"
            fill="currentColor"
          />
          <path
            d="M19 10V11C19 14.87 15.87 18 12 18C8.13 18 5 14.87 5 11V10H7V11C7 13.76 9.24 16 12 16C14.76 16 17 13.76 17 11V10H19Z"
            fill="currentColor"
          />
          <path
            d="M11 22H13V19H11V22Z"
            fill="currentColor"
          />
        </>
      )}
    </svg>
  );

  return (
    <div className="flex flex-col items-center">
      <button
        onMouseDown={handleStartRecording}
        onTouchStart={handleStartRecording}
        className={`w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center transition-all duration-200 ${
          isRecording
            ? 'bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 shadow-lg shadow-red-500/50 scale-105'
            : 'bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 active:scale-95 shadow-lg shadow-blue-500/30'
        } text-white touch-manipulation select-none`}
        aria-label={isRecording ? 'Recording... Release to send' : 'Hold to record'}
      >
        <MicrophoneIcon isRecording={isRecording} />
      </button>
      {isRecording && (
        <div className="mt-3 text-center">
          <p className="text-xs font-medium text-gray-700 animate-pulse mb-2">Recording... Release to send</p>
          {transcript ? (
            <div className="max-w-xs mx-auto px-3 py-2 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-gray-200/60">
              <p className="text-sm text-gray-800 leading-relaxed">
                {transcript}
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-500 mt-1 italic">Listening...</p>
          )}
          {speechError && (
            <p className="text-xs text-red-600 mt-2 font-medium">{speechError}</p>
          )}
        </div>
      )}
      {!isRecording && speechError && (
        <p className="text-xs text-red-500 mt-2 text-center max-w-xs">{speechError}</p>
      )}
    </div>
  );
}
