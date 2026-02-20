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
  onMessageSent: (message: Message) => void;
  onProcessingChange: (processing: boolean) => void;
}

export default function RecordButton({
  conversationId,
  onMessageSent,
  onProcessingChange,
}: RecordButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
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
        setFinalTranscript(text);
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
    
    // Get final transcript
    const textToSend = finalTranscript || transcript || '';
    
    if (!textToSend.trim()) {
      // No text recognized, silently ignore
      isProcessingRef.current = false;
      if (audioBlob) {
        URL.revokeObjectURL(URL.createObjectURL(audioBlob));
      }
      return;
    }

    // Create blob URL for user audio playback if available
    const userAudioUrl = audioBlob ? URL.createObjectURL(audioBlob) : undefined;

    onProcessingChange(true);
    try {
      const response = await sendTextMessage(textToSend, conversationId);
      
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
      
      // Reset transcript state to ensure clean state for next recording
      // This is important for continuous conversations
      setTimeout(() => {
        setFinalTranscript('');
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

  return (
    <div className="flex flex-col items-center">
      <button
        onMouseDown={handleStartRecording}
        onTouchStart={handleStartRecording}
        className={`w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center text-2xl md:text-3xl transition-all ${
          isRecording
            ? 'bg-red-500 hover:bg-red-600 animate-pulse'
            : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800'
        } text-white shadow-lg touch-manipulation select-none`}
        aria-label={isRecording ? 'Recording... Release to send' : 'Hold to record'}
      >
        {isRecording ? '🔴' : '🎤'}
      </button>
      {isRecording && (
        <div className="mt-2 text-center">
          <p className="text-xs text-gray-600 animate-pulse">Recording... Release to send</p>
          {transcript ? (
            <p className="text-xs text-gray-700 mt-1 max-w-xs px-2 py-1 bg-gray-100 rounded">
              {transcript}
            </p>
          ) : (
            <p className="text-xs text-gray-400 mt-1 italic">Listening...</p>
          )}
          {speechError && (
            <p className="text-xs text-red-500 mt-1">{speechError}</p>
          )}
        </div>
      )}
      {!isRecording && speechError && (
        <p className="text-xs text-red-500 mt-2 text-center max-w-xs">{speechError}</p>
      )}
    </div>
  );
}
