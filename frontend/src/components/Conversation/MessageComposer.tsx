import { useEffect, useMemo, useRef, useState } from 'react';
import { useAudioRecorder } from '../../hooks/useAudioRecorder';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { getSuggestions, sendTextMessage, sendTextMessageStream, uploadMessageAudio } from '../../services/api';
import { Message } from '../../types';
import { requestMicrophoneAccess, getMicrophonePermissionInstructions, requiresHTTPS, isMobile } from '../../utils/permissionHelper';

interface MessageComposerProps {
  practiceLanguage: 'en' | 'he';
  conversationId: string;
  messages: Message[];
  isProcessing: boolean;
  onMessageSent: (message: Message) => void;
  onProcessingChange: (processing: boolean) => void;
  autoPlayAudio: boolean;
  restartNonce: number;
  onPatchMessage: (messageId: string, patch: Partial<Message>) => void;
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
  practiceLanguage,
  conversationId,
  messages,
  isProcessing,
  onMessageSent,
  onProcessingChange,
  autoPlayAudio,
  restartNonce,
  onPatchMessage,
}: MessageComposerProps) {
  const [inputText, setInputText] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);

  const latestTranscriptRef = useRef<string>('');
  const sttLang = practiceLanguage === 'he' ? 'he-IL' : 'en-US';

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
    reset: resetSpeech,
  } = useSpeechRecognition({
    language: sttLang,
    continuous: true,
    interimResults: true,
  });

  const suppressSpeechToInputRef = useRef(false);
  const pendingUserAudioBlobRef = useRef<Blob | null>(null);
  const userOverrodeInputRef = useRef(false); // user typed/edited input while listening; don't clobber with STT

  // When conversation is restarted (same conversationId, messages cleared), reset composer state.
  useEffect(() => {
    setInputText('');
    setShowSuggestions(false);
    setSuggestions([]);
    pendingUserAudioBlobRef.current = null;
    latestTranscriptRef.current = '';
    suppressSpeechToInputRef.current = false;
    userOverrodeInputRef.current = false;
    // Ensure speech is not running
    stopListening();
    abortSpeech();
    resetSpeech();
  }, [restartNonce]);

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

  // Sync transcript from speech recognition into the input field and latestTranscriptRef (for send).
  useEffect(() => {
    if (suppressSpeechToInputRef.current) return;
    if (userOverrodeInputRef.current) return;
    const punctuatedFinal = autoPunctuate(finalTranscript || '');
    const display = `${punctuatedFinal}${punctuatedFinal && interimTranscript ? ' ' : ''}${interimTranscript || ''}`.trim() || transcript || '';
    latestTranscriptRef.current = display;
    setInputText(display);
    if (!display && isListening) {
      setInputText('');
    }
  }, [transcript, finalTranscript, interimTranscript, isListening]);

  const conversationHistory = useMemo(() => {
    return messages
      .slice(-6)
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
      if (messages[i].type === 'ai' && messages[i].aiResponseText) return messages[i].aiResponseText || '';
    }
    return '';
  }, [messages]);

  const sendUserText = async (text: string, opts?: { userAudioUrl?: string; isSuggestedReply?: boolean }) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (isProcessing) return;

    onProcessingChange(true);

    const now = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const userMessage: Message = {
      id: `user_${now}_${rand}`,
      conversationId: conversationId || 'temp',
      type: 'user',
      transcription: trimmed,
      userAudioUrl: opts?.userAudioUrl,
      isSuggestedReply: !!opts?.isSuggestedReply,
      createdAt: new Date(now).toISOString(),
    };

    const aiMessage: Message = {
      id: `ai_${now + 1}_${rand}`,
      conversationId: conversationId || 'temp',
      type: 'ai',
      aiResponseText: '',
      createdAt: new Date(now + 1).toISOString(),
    };

    // Optimistic UI: show bubbles immediately, then stream AI tokens into the AI bubble.
    onMessageSent(userMessage);
    setTimeout(() => onMessageSent(aiMessage), 30);

    try {
      let acc = '';
      await sendTextMessageStream(
        trimmed,
        conversationId,
        conversationHistory,
        {
          userMessageId: userMessage.id,
          aiMessageId: aiMessage.id,
          isSuggestedReply: !!opts?.isSuggestedReply,
          userCreatedAt: userMessage.createdAt,
          aiCreatedAt: aiMessage.createdAt,
        },
        {
          onDelta: (delta) => {
            acc += delta;
            onPatchMessage(aiMessage.id, { aiResponseText: acc });
          },
          onAudioDataUrl: (audioDataUrl) => {
            try {
              // Convert dataURL to blob URL for Howler playback consistency
              const base64 = audioDataUrl.split('base64,')[1];
              if (!base64) return;
              const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
              const blob = new Blob([bytes], { type: 'audio/mpeg' });
              const url = URL.createObjectURL(blob);
              onPatchMessage(aiMessage.id, { audioUrl: url });
            } catch (e) {
              console.warn('Failed to handle streamed audioDataUrl (non-fatal):', e);
            }
          },
        }
      );
      return { userMessageId: userMessage.id, aiMessageId: aiMessage.id };
    } catch (e) {
      // Fallback to non-stream endpoint
      const response = await sendTextMessage(trimmed, conversationId, conversationHistory, {
        userMessageId: userMessage.id,
        aiMessageId: aiMessage.id,
        isSuggestedReply: !!opts?.isSuggestedReply,
        userCreatedAt: userMessage.createdAt,
        aiCreatedAt: aiMessage.createdAt,
      });
      onPatchMessage(aiMessage.id, { aiResponseText: response.aiResponseText });
      return { userMessageId: userMessage.id, aiMessageId: aiMessage.id };
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
    resetSpeech();

    // IMPORTANT: when user edits the input, inputText is the source of truth.
    const textToSend = autoPunctuate((inputText || '').trim().length > 0 ? inputText : (latestTranscriptRef.current || ''));

    let userAudioUrl: string | undefined;
    if (isAudioRecordingRef.current) {
      const audioBlob = await stopAudioRecording();
      // Store blob for later send (when autoplay is OFF)
      pendingUserAudioBlobRef.current = audioBlob || null;
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
      latestTranscriptRef.current = '';
      pendingUserAudioBlobRef.current = null;
      userOverrodeInputRef.current = false;
      await sendUserText(textToSend, { userAudioUrl, isSuggestedReply: false });
      return;
    }

    const text = inputText;
    setInputText('');

    // If we have pending voice audio from a stopped recording, attach it.
    let userAudioUrl: string | undefined;
    if (pendingUserAudioBlobRef.current) {
      userAudioUrl = URL.createObjectURL(pendingUserAudioBlobRef.current);
      pendingUserAudioBlobRef.current = null;
    }
    latestTranscriptRef.current = '';
    await sendUserText(text, { userAudioUrl, isSuggestedReply: false });
  };

  const handleToggleMic = async () => {
    if (isProcessing) return;

    if (!isListening) {
      if (isMobile()) {
        alert(
          '📱 Use the keyboard voice input\n\n' +
            'On mobile, voice recognition works better with the device keyboard.\n\n' +
            '1. Tap the input box below.\n' +
            '2. When the keyboard appears, tap the microphone icon on the keyboard.\n' +
            '3. Speak; the text will appear in the input box.'
        );
        return;
      }

      if (requiresHTTPS()) {
        alert(
          '⚠️ HTTPS Required\n\nMobile browsers require HTTPS for microphone access (except localhost).\n\nPlease access via HTTPS.'
        );
        return;
      }

      const permissionCheck = await requestMicrophoneAccess();
      if (!permissionCheck.granted) {
        const instructions = getMicrophonePermissionInstructions();
        alert(`❌ Microphone Permission Required\n\n${permissionCheck.error || ''}\n\n${instructions}`);
        return;
      }

      setShowSuggestions(false);
      setInputText('');
      latestTranscriptRef.current = '';
      userOverrodeInputRef.current = false;

      // IMPORTANT: start speech recognition in the same user gesture without setTimeout,
      // otherwise some browsers require a second click.
      if (isListening) {
        stopListening();
        abortSpeech();
        await new Promise((r) => setTimeout(r, 100));
      }
      resetSpeech();
      abortSpeech();
      startListening();

      // Start audio recording (doesn't need to block speech start)
      startAudioRecording()
        .then(() => {
          isAudioRecordingRef.current = true;
        })
        .catch((e) => {
          isAudioRecordingRef.current = false;
          console.warn('Failed to start audio recording (non-fatal):', e);
        });
      return;
    }

    // Stop recording and send
    suppressSpeechToInputRef.current = true;
    userOverrodeInputRef.current = false;

    // Stop speech immediately; do NOT wait for audio blob to finish before sending (perf)
    stopListening();
    await new Promise((r) => setTimeout(r, 200));
    abortSpeech();
    resetSpeech();

    const textToSend = autoPunctuate((inputText || '').trim().length > 0 ? inputText : (latestTranscriptRef.current || ''));

    // Kick off audio stop in background
    const audioPromise = isAudioRecordingRef.current ? stopAudioRecording() : Promise.resolve(null);
    isAudioRecordingRef.current = false;

    // Always keep the recognized text in the input after stopping.
    setInputText(textToSend);

    // Always keep the recognized text in the input after stopping.
    // Only auto-send if autoplay is enabled.
    if (autoPlayAudio) {
      setInputText('');
      latestTranscriptRef.current = '';
      const ids = await sendUserText(textToSend, { userAudioUrl: undefined, isSuggestedReply: false });

      // Background: upload user audio and patch message with final URL
      audioPromise
        .then(async (blob) => {
          if (!blob || !ids?.userMessageId) return;
          const { url } = await uploadMessageAudio({
            conversationId,
            messageId: ids.userMessageId,
            kind: 'user',
            blob,
          });
          onPatchMessage(ids.userMessageId, { userAudioUrl: url });
        })
        .catch((e) => console.warn('User audio upload failed (non-fatal):', e));
    } else {
      // Autoplay OFF: keep audio blob pending until user presses Send
      audioPromise
        .then((blob) => {
          pendingUserAudioBlobRef.current = blob;
        })
        .catch(() => {
          pendingUserAudioBlobRef.current = null;
        });
    }

    // Re-enable speech->input updates after a short delay
    setTimeout(() => {
      suppressSpeechToInputRef.current = false;
    }, 300);
  };

  const handleToggleSuggestions = async () => {
    if (isProcessing) return;
    if (showSuggestions) {
      setShowSuggestions(false);
      return;
    }

    const lastAiText = lastAiMessageText || '';
    if (!lastAiText.trim()) {
      setSuggestions([]);
      setShowSuggestions(true);
      return;
    }

    setShowSuggestions(true);
    setIsFetchingSuggestions(true);
    try {
      const result = await getSuggestions(lastAiText, conversationHistory);
      setSuggestions(result.suggestions || []);
    } catch (e: any) {
      console.error(e);
      setSuggestions([]);
    } finally {
      setIsFetchingSuggestions(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto relative min-w-0">
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

      <div className="flex items-center gap-2 sm:gap-3 w-full min-w-0">
        <button
          onClick={handleToggleMic}
          className={`w-11 h-11 flex-shrink-0 rounded-full flex items-center justify-center transition-all ${
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
          className="w-11 h-11 flex-shrink-0 rounded-full bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50/40 flex items-center justify-center shadow-sm"
          aria-label="Suggested replies"
        >
          <HamburgerIcon />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center bg-white border border-gray-200/70 rounded-2xl px-3 sm:px-4 py-2 shadow-sm min-w-0">
            <input
              value={inputText}
              onChange={(e) => {
                const v = e.target.value;
                setInputText(v);
                latestTranscriptRef.current = v; // source of truth for sending
                if (isListening) {
                  userOverrodeInputRef.current = true; // freeze STT->input so user edits aren't clobbered
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={isProcessing}
              placeholder={isListening ? 'Listening…' : 'Type a response'}
              className="flex-1 min-w-0 bg-transparent outline-none text-sm text-gray-800 placeholder:text-gray-400 py-2 w-0"
            />
            <button
              onClick={handleSend}
              disabled={isProcessing || !inputText.trim()}
              className="ml-2 sm:ml-3 w-10 h-10 flex-shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 disabled:from-gray-300 disabled:to-gray-300 text-white flex items-center justify-center transition-all active:scale-95"
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

