import { useEffect, useMemo, useRef, useState } from 'react';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { getSuggestions, sendTextMessage } from '../../services/api';
import { Message } from '../../types';
import { checkMicrophonePermission, getMicrophonePermissionInstructions, requiresHTTPS } from '../../utils/permissionHelper';

interface MessageComposerProps {
  conversationId: string;
  messages: Message[];
  isProcessing: boolean;
  onMessageSent: (message: Message) => void;
  onProcessingChange: (processing: boolean) => void;
}

function MicrophoneIcon({ isRecording }: { isRecording: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-white">
      {isRecording ? (
        <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
      ) : (
        <>
          <path
            d="M12 2C10.34 2 9 3.34 9 5V11C9 12.66 10.34 14 12 14C13.66 14 15 12.66 15 11V5C15 3.34 13.66 2 12 2Z"
            fill="currentColor"
          />
          <path
            d="M19 10V11C19 14.87 15.87 18 12 18C8.13 18 5 14.87 5 11V10H7V11C7 13.76 9.24 16 12 16C14.76 16 17 13.76 17 11V10H19Z"
            fill="currentColor"
          />
          <path d="M11 22H13V19H11V22Z" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-blue-600">
      <path d="M4 6h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-white">
      <path
        d="M3 11.5L21 3L12.5 21L11 13L3 11.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function MessageComposer({
  conversationId,
  messages,
  isProcessing,
  onMessageSent,
  onProcessingChange,
}: MessageComposerProps) {
  const [inputText, setInputText] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);

  const latestTranscriptRef = useRef<string>('');

  const { startRecording: startAudioRecording, stopRecording: stopAudioRecording } = useAudioRecorder();

  const {
    isListening,
    transcript,
    finalTranscript,
    interimTranscript,
    error: speechError,
    startListening,
    stopListening,
    abort: abortSpeech,
  } = useSpeechRecognition({
    language: 'en-US',
    continuous: true,
    interimResults: true,
  });

  const autoPunctuate = (text: string) => {
    let t = (text || '').trim();
    if (!t) return '';

    // Light comma insertion for common conjunctions (best-effort)
    t = t
      .replace(/\s+but\s+/gi, ', but ')
      .replace(/\s+so\s+/gi, ', so ')
      .replace(/\s+however\s+/gi, ', however ');

    // Avoid double commas
    t = t.replace(/,\s*,/g, ', ');

    // If already has terminal punctuation, keep it.
    if (/[.!?]$/.test(t)) return t;

    const lower = t.toLowerCase();
    const looksLikeQuestion =
      /^(who|what|why|how|when|where|which)\b/.test(lower) ||
      /^(is|are|am|do|does|did|can|could|would|should|will|have|has|had)\b/.test(lower) ||
      /\b(what|why|how|when|where|which)\b/.test(lower);

    return looksLikeQuestion ? `${t}?` : `${t}.`;
  };

  // Keep a ref of transcript for stop-time sending
  useEffect(() => {
    // Build display text as: punctuated final + raw interim (token-like)
    const punctuatedFinal = autoPunctuate(finalTranscript || '');
    const combined = `${punctuatedFinal}${punctuatedFinal && interimTranscript ? ' ' : ''}${interimTranscript || ''}`.trim();

    latestTranscriptRef.current = combined || transcript || '';
    if (isListening) {
      // Real-time updates into input field (token-like)
      setInputText(combined || transcript || '');
    }
  }, [transcript, finalTranscript, interimTranscript, isListening]);

  const conversationHistory = useMemo(() => {
    return messages
      .slice(-10)
      .map((msg) => {
        if (msg.type === 'user') {
          return { role: 'user' as const, content: msg.transcription || '' };
        }
        return { role: 'assistant' as const, content: msg.aiResponseText || '' };
      })
      .filter((m) => m.content.trim().length > 0);
  }, [messages]);

  const lastAiMessageText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === 'ai' && messages[i].aiResponseText) return messages[i].aiResponseText;
    }
    return '';
  }, [messages]);

  const sendUserText = async (text: string, opts?: { userAudioUrl?: string; isSuggestedReply?: boolean }) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (isProcessing) return;

    onProcessingChange(true);
    try {
      const response = await sendTextMessage(trimmed, conversationId, conversationHistory);

      const now = Date.now();
      const userMessage: Message = {
        id: `user_${now}`,
        conversationId: conversationId || 'temp',
        type: 'user',
        transcription: trimmed,
        userAudioUrl: opts?.userAudioUrl,
        isSuggestedReply: !!opts?.isSuggestedReply,
        createdAt: new Date(now).toISOString(),
      };

      const aiMessage: Message = {
        id: `ai_${now + 1}`,
        conversationId: conversationId || 'temp',
        type: 'ai',
        aiResponseText: response.aiResponseText,
        createdAt: new Date(now + 1).toISOString(),
      };

      onMessageSent(userMessage);
      setTimeout(() => onMessageSent(aiMessage), 30);
    } finally {
      onProcessingChange(false);
    }
  };

  const isAudioRecordingRef = useRef(false);

  const stopMicAndGetPayload = async () => {
    // Stop speech recognition first to avoid capturing TTS or other audio
    stopListening();
    // Give Web Speech API a short moment to flush final results
    await new Promise((r) => setTimeout(r, 200));
    // Hard abort to ensure it doesn't auto-restart
    abortSpeech();

    const textToSend = autoPunctuate(latestTranscriptRef.current || inputText);

    let userAudioUrl: string | undefined;
    if (isAudioRecordingRef.current) {
      const audioBlob = await stopAudioRecording();
      userAudioUrl = audioBlob ? URL.createObjectURL(audioBlob) : undefined;
      isAudioRecordingRef.current = false;
    }

    return { textToSend, userAudioUrl };
  };

  const handleSend = async () => {
    setShowSuggestions(false);

    // If mic is active, stop it before sending to avoid weird states / capturing AI TTS
    if (isListening) {
      const { textToSend, userAudioUrl } = await stopMicAndGetPayload();
      setInputText('');
      await sendUserText(textToSend, { userAudioUrl, isSuggestedReply: false });
      return;
    }

    const text = inputText;
    setInputText('');
    await sendUserText(text, { isSuggestedReply: false });
  };

  const handleToggleMic = async () => {
    if (isProcessing) return;

    if (!isListening) {
      // Start recording (toggle)
      if (requiresHTTPS()) {
        alert(
          '⚠️ HTTPS Required\n\nMobile browsers require HTTPS for microphone access (except localhost).\n\nPlease access via HTTPS.'
        );
        return;
      }

      const permissionCheck = await checkMicrophonePermission();
      if (!permissionCheck.granted) {
        const instructions = getMicrophonePermissionInstructions();
        alert(`❌ Microphone Permission Required\n\n${permissionCheck.error || ''}\n\n${instructions}`);
        return;
      }

      setShowSuggestions(false);
      setInputText('');
      latestTranscriptRef.current = '';
      // Start audio capture first, then speech recognition (more reliable on first tap)
      await startAudioRecording();
      isAudioRecordingRef.current = true;
      setTimeout(() => {
        // Ensure clean state
        abortSpeech();
        startListening();
      }, 50);
      return;
    }

    // Stop recording and send
    const { textToSend, userAudioUrl } = await stopMicAndGetPayload();
    setInputText('');
    await sendUserText(textToSend, { userAudioUrl, isSuggestedReply: false });
  };

  const handleToggleSuggestions = async () => {
    if (isProcessing) return;
    if (showSuggestions) {
      setShowSuggestions(false);
      return;
    }

    if (!lastAiMessageText.trim()) {
      setSuggestions([]);
      setShowSuggestions(true);
      return;
    }

    setShowSuggestions(true);
    setIsFetchingSuggestions(true);
    try {
      const result = await getSuggestions(lastAiMessageText, conversationHistory);
      setSuggestions(result.suggestions || []);
    } catch (e: any) {
      console.error(e);
      setSuggestions([]);
    } finally {
      setIsFetchingSuggestions(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto relative">
      {showSuggestions && (
        <div className="mb-4 bg-white/95 backdrop-blur-sm border border-gray-200/70 rounded-2xl shadow-lg p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">Here are some suggested responses:</p>
          {isFetchingSuggestions ? (
            <div className="text-sm text-gray-500">Loading suggestions...</div>
          ) : suggestions.length === 0 ? (
            <div className="text-sm text-gray-500">No suggestions available.</div>
          ) : (
            <div className="space-y-2">
              {suggestions.slice(0, 3).map((s, idx) => (
                <button
                  key={idx}
                  onClick={async () => {
                    setShowSuggestions(false);
                    setInputText('');
                    await sendUserText(s, { isSuggestedReply: true });
                  }}
                  className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors text-sm text-gray-800"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleToggleMic}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
            isListening
              ? 'bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/30'
              : 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-md shadow-blue-500/20 hover:from-blue-600 hover:to-blue-700'
          }`}
          aria-label={isListening ? 'Stop recording and send' : 'Start recording'}
        >
          <MicrophoneIcon isRecording={isListening} />
        </button>

        <button
          onClick={handleToggleSuggestions}
          className="w-11 h-11 rounded-full bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50/40 transition-colors flex items-center justify-center shadow-sm"
          aria-label="Suggested replies"
        >
          <HamburgerIcon />
        </button>

        <div className="flex-1">
          <div className="flex items-center bg-white border border-gray-200/70 rounded-2xl px-4 py-2 shadow-sm">
            <input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={isProcessing}
              placeholder={isListening ? 'Listening…' : 'Type a response'}
              className="flex-1 bg-transparent outline-none text-sm text-gray-800 placeholder:text-gray-400 py-2"
            />
            <button
              onClick={handleSend}
              disabled={isProcessing || !inputText.trim()}
              className="ml-3 w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 disabled:from-gray-300 disabled:to-gray-300 text-white flex items-center justify-center transition-all active:scale-95"
              aria-label="Send"
            >
              <SendIcon />
            </button>
          </div>
          {!!speechError && (
            <p className="text-xs text-red-600 mt-2">{speechError}</p>
          )}
        </div>
      </div>
    </div>
  );
}

