import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ConversationList from './ConversationList';
import ConversationView from './ConversationView';
import { Conversation, Message } from '../../types';
import {
  deleteConversation as apiDeleteConversation,
  getConversationMessages,
  getFeedback,
  listConversations,
  resetConversation,
  startConversation,
  uploadMessageAudio,
} from '../../services/api';

function generateConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function getConversationTitle(conversations: Conversation[], id: string | null): string {
  if (!id) return 'Conversation';
  return conversations.find((c) => c.id === id)?.title || 'Conversation';
}

export default function ConversationScreen() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedbackLoadingIds, setFeedbackLoadingIds] = useState<Set<string>>(new Set());
  const [isMobileView, setIsMobileView] = useState(false);
  const [showConversationList, setShowConversationList] = useState(true);
  const [autoPlayAudio, setAutoPlayAudio] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('eng_ai_voice_autoplay_audio');
      return v ? v === 'true' : true;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('eng_ai_voice_autoplay_audio', String(autoPlayAudio));
    } catch {
      // ignore
    }
  }, [autoPlayAudio]);

  const [restartNonce, setRestartNonce] = useState(0);

  // Detect mobile/tablet/desktop
  useEffect(() => {
    const checkMobile = () => {
      setIsMobileView(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setShowConversationList(true); // Always show sidebar on desktop/tablet
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Load conversations on mount
  useEffect(() => {
    const boot = async () => {
      const loaded = await listConversations();
      setConversations(loaded);

      if (loaded.length === 0) {
        const id = generateConversationId();
        await startConversation(id, 'New Conversation');
        const next = await listConversations();
        setConversations(next);
        setCurrentConversationId(id);
        setShowConversationList(false);
      } else if (!currentConversationId) {
        setCurrentConversationId(loaded[0].id);
        setShowConversationList(false);
      }
    };
    boot().catch((e) => console.error('Failed to boot conversations:', e));
  }, []);

  // Load messages when conversation changes
  useEffect(() => {
    if (currentConversationId) {
      const loadMessages = async () => {
        const loadedMessages = await getConversationMessages(currentConversationId);
        setMessages(loadedMessages);
        setShowConversationList(false);
      };
      loadMessages();
    }
  }, [currentConversationId]);

  const handleCreateConversation = () => {
    const create = async () => {
      const id = generateConversationId();
      await startConversation(id, 'New Conversation');
      const next = await listConversations();
      setConversations(next);
      setCurrentConversationId(id);
      setMessages([]);
      setShowConversationList(false);
    };
    create().catch((e) => console.error('Failed to create conversation:', e));
  };

  const handleRestartConversation = () => {
    if (!currentConversationId) return;

    const conversationId = currentConversationId;
    // Immediately clear UI
    setMessages([]);
    setRestartNonce((n) => n + 1);

    (async () => {
      await resetConversation(conversationId);
      const [nextConversations, nextMessages] = await Promise.all([
        listConversations(),
        getConversationMessages(conversationId),
      ]);
      setConversations(nextConversations);
      setMessages(nextMessages);
    })().catch((e) => console.error('Failed to restart conversation:', e));
  };

  const handleSelectConversation = (conversationId: string) => {
    setCurrentConversationId(conversationId);
    if (isMobileView) {
      setShowConversationList(false);
    }
  };

  const handleDeleteConversation = async (conversationId: string) => {
    await apiDeleteConversation(conversationId);
    const next = (await listConversations()) || [];
    setConversations(next);
    
    if (currentConversationId === conversationId) {
      if (next.length > 0) setCurrentConversationId(next[0].id);
      else {
        const id = generateConversationId();
        await startConversation(id, 'New Conversation');
        const refreshed = await listConversations();
        setConversations(refreshed);
        setCurrentConversationId(id);
        setMessages([]);
      }
    }
  };

  const handleNewMessage = (newMessage: Message) => {
    if (currentConversationId) {
      // Immediately add message to UI for instant feedback (synchronous)
      setMessages((prev) => {
        // Ensure messages are sorted by createdAt to maintain order
        const updated = [...prev, newMessage];
        return updated.sort((a, b) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      });
      
      // All persistence operations in background - don't block UI rendering
      setTimeout(() => {
        // If message has local blob audio, upload to server in background and replace URL
        if (newMessage.userAudioUrl && newMessage.userAudioUrl.startsWith('blob:')) {
          fetch(newMessage.userAudioUrl)
            .then((r) => r.blob())
            .then(async (blob) => {
              const { url } = await uploadMessageAudio({
                conversationId: currentConversationId,
                messageId: newMessage.id,
                kind: 'user',
                blob,
              });
              setMessages((prev) => prev.map((m) => (m.id === newMessage.id ? { ...m, userAudioUrl: url } : m)));
            })
            .catch((e) => console.error('Audio upload failed:', e));
        }
        // Refresh conversations list (lastMessage/updatedAt)
        listConversations()
          .then((next) => setConversations(next))
          .catch((e) => console.error('Failed to refresh conversations:', e));

        // If this is an AI message, its server-side TTS URL may be attached asynchronously.
        // Refresh messages in a MERGE fashion to pick up ai_audio_url without clobbering
        // streaming AI text already shown in the UI.
        if (newMessage.type === 'ai') {
          const mergeFromServer = async (): Promise<boolean> => {
            try {
              const latest = await getConversationMessages(currentConversationId);
              const srvHasAudio = !!latest.find((m) => m.id === newMessage.id)?.audioUrl;
              setMessages((prev) => {
                const prevById = new Map(prev.map((m) => [m.id, m]));
                const merged = latest.map((srv) => {
                  const local = prevById.get(srv.id);
                  if (!local) return srv;

                  const mergedAiText =
                    (srv.aiResponseText || '').trim().length === 0 && (local.aiResponseText || '').trim().length > 0
                      ? local.aiResponseText
                      : (srv.aiResponseText || '').length >= (local.aiResponseText || '').length
                        ? srv.aiResponseText
                        : local.aiResponseText;

                  return {
                    ...local,
                    ...srv,
                    // Preserve the longer / non-empty AI text (streaming)
                    aiResponseText: mergedAiText,
                    // Prefer server URLs when available
                    userAudioUrl:
                      srv.userAudioUrl && srv.userAudioUrl.trim().length > 0 ? srv.userAudioUrl : local.userAudioUrl,
                    audioUrl: srv.audioUrl && srv.audioUrl.trim().length > 0 ? srv.audioUrl : local.audioUrl,
                  };
                });

                // Keep any purely-local messages that aren't on server yet
                const latestIds = new Set(latest.map((m) => m.id));
                const onlyLocal = prev.filter((m) => !latestIds.has(m.id));
                const combined = [...merged, ...onlyLocal];
                return combined.sort(
                  (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                );
              });
              return srvHasAudio;
            } catch (e) {
              console.warn('Failed to refresh messages for AI audio URL:', e);
              return false;
            }
          };

          // Poll for AI audio URL for up to ~30s (best-effort). This avoids full UI regressions.
          (async () => {
            let tries = 0;
            const maxTries = 15;
            const intervalMs = 2000;
            await new Promise((r) => setTimeout(r, 1500));
            while (tries < maxTries) {
              tries += 1;
              const hasAudio = await mergeFromServer();
              if (hasAudio) break;
              await new Promise((r) => setTimeout(r, intervalMs));
            }
          })();
        }
      }, 0);
    }
  };

  const handlePatchMessage = (messageId: string, patch: Partial<Message>) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, ...patch } : m)));
  };

  const handleRequestFeedback = async (messageId: string) => {
    const target = messages.find((m) => m.id === messageId);
    if (!target || target.type !== 'user') return;
    if (!target.transcription || !target.transcription.trim()) return;
    if (target.isSuggestedReply) return;
    if (target.correctedText) return;

    setFeedbackLoadingIds((prev) => new Set(prev).add(messageId));
    try {
      const result = await getFeedback(target.transcription, {
        conversationId: currentConversationId || undefined,
        messageId,
      });
      const updatedMessage: Message = {
        ...target,
        correctedText: result.correctedText,
        explanation: result.explanation,
      };

      // Update UI immediately
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updatedMessage : m)));

      // Feedback is persisted by backend when conversationId+messageId are provided
    } catch (error) {
      console.error('Feedback error:', error);
      alert('Failed to get feedback. Please try again.');
    } finally {
      setFeedbackLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  };

  // Mobile: Show list or conversation
  if (isMobileView) {
    if (showConversationList) {
      return (
        <div className="flex flex-col h-screen bg-gray-50">
          {/* Top Bar */}
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 shadow-md px-4 py-4 flex items-center justify-between">
            <h1 className="text-lg font-bold text-white">Conversations</h1>
            <button
              onClick={() => navigate('/settings')}
              className="text-white/90 hover:text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-white/20 transition-colors"
            >
              Settings
            </button>
          </div>
          
          <ConversationList
            conversations={conversations}
            currentConversationId={currentConversationId}
            onSelectConversation={handleSelectConversation}
            onCreateConversation={handleCreateConversation}
            onDeleteConversation={handleDeleteConversation}
          />
        </div>
      );
    } else {
      return (
        <div className="flex flex-col h-screen bg-gray-50 min-h-0">
          {/* Top Bar */}
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 shadow-md px-4 py-4 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center">
              <button
                onClick={() => setShowConversationList(true)}
                className="mr-4 text-white/90 hover:text-white font-medium"
              >
                ← Back
              </button>
              <h1 className="text-lg font-bold text-white">
                {getConversationTitle(conversations, currentConversationId)}
              </h1>
            </div>
            <button
              onClick={() => navigate('/settings')}
              className="text-white/90 hover:text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-white/20 transition-colors"
            >
              Settings
            </button>
          </div>
          
          {currentConversationId && (
            <div className="flex-1 min-h-0">
              <ConversationView
                messages={messages}
                isProcessing={isProcessing}
                conversationId={currentConversationId}
                onMessageSent={handleNewMessage}
                onProcessingChange={setIsProcessing}
                onRequestFeedback={handleRequestFeedback}
                feedbackLoadingIds={feedbackLoadingIds}
                autoPlayAudio={autoPlayAudio}
                onToggleAutoPlayAudio={setAutoPlayAudio}
                onRestartConversation={handleRestartConversation}
                restartNonce={restartNonce}
                onPatchMessage={handlePatchMessage}
              />
            </div>
          )}
        </div>
      );
    }
  }

  // Desktop/Tablet: Sidebar + Conversation
  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-indigo-50/20">
      {/* Sidebar */}
      <div className="w-80 flex-shrink-0 border-r border-gray-200/60 bg-white/80 backdrop-blur-sm">
        <div className="h-full flex flex-col">
          {/* Top Bar */}
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 shadow-md px-4 py-4 flex items-center justify-between">
            <h1 className="text-lg font-bold text-white">AI English Practice</h1>
            <button
              onClick={() => navigate('/settings')}
              className="text-gray-600 hover:text-gray-900 text-sm"
            >
              Settings
            </button>
          </div>
          
          <ConversationList
            conversations={conversations}
            currentConversationId={currentConversationId}
            onSelectConversation={handleSelectConversation}
            onCreateConversation={handleCreateConversation}
            onDeleteConversation={handleDeleteConversation}
          />
        </div>
      </div>

      {/* Main Conversation Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {currentConversationId ? (
          <>
            <div className="flex-1 min-h-0">
              <ConversationView
                messages={messages}
                isProcessing={isProcessing}
                conversationId={currentConversationId}
                onMessageSent={handleNewMessage}
                onProcessingChange={setIsProcessing}
                onRequestFeedback={handleRequestFeedback}
                feedbackLoadingIds={feedbackLoadingIds}
                autoPlayAudio={autoPlayAudio}
                onToggleAutoPlayAudio={setAutoPlayAudio}
                onRestartConversation={handleRestartConversation}
                restartNonce={restartNonce}
                onPatchMessage={handlePatchMessage}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <p className="text-gray-500 mb-4">Select a conversation or create a new one</p>
              <button
                onClick={handleCreateConversation}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Start New Conversation
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
