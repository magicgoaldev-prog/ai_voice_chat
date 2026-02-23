import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ConversationList from './ConversationList';
import ConversationView from './ConversationView';
import { Conversation, Message } from '../../types';
import { getFeedback } from '../../services/api';
import {
  getConversations,
  createNewConversation,
  deleteConversation,
  saveMessage,
  getConversation,
  loadMessagesWithAudio,
  loadMessageWithAudio,
} from '../../utils/conversationStorage';

export default function ConversationScreen() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedbackLoadingIds, setFeedbackLoadingIds] = useState<Set<string>>(new Set());
  const [isMobileView, setIsMobileView] = useState(false);
  const [showConversationList, setShowConversationList] = useState(true);

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
    const loadedConversations = getConversations();
    setConversations(loadedConversations);
    
    // If no conversations, create one
    if (loadedConversations.length === 0) {
      const newConv = createNewConversation();
      setConversations([newConv]);
      setCurrentConversationId(newConv.id);
      setShowConversationList(false);
    } else if (loadedConversations.length > 0 && !currentConversationId) {
      // Load most recent conversation
      setCurrentConversationId(loadedConversations[0].id);
      setShowConversationList(false);
    }
  }, []);

  // Load messages when conversation changes
  useEffect(() => {
    if (currentConversationId) {
      const loadMessages = async () => {
        const loadedMessages = await loadMessagesWithAudio(currentConversationId);
        setMessages(loadedMessages);
        setShowConversationList(false);
      };
      loadMessages();
    }
  }, [currentConversationId]);

  const handleCreateConversation = () => {
    const newConv = createNewConversation();
    setConversations((prev) => [newConv, ...prev]);
    setCurrentConversationId(newConv.id);
    setMessages([]);
    setShowConversationList(false);
  };

  const handleSelectConversation = (conversationId: string) => {
    setCurrentConversationId(conversationId);
    if (isMobileView) {
      setShowConversationList(false);
    }
  };

  const handleDeleteConversation = async (conversationId: string) => {
    await deleteConversation(conversationId);
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));
    
    if (currentConversationId === conversationId) {
      const remaining = conversations.filter((c) => c.id !== conversationId);
      if (remaining.length > 0) {
        setCurrentConversationId(remaining[0].id);
      } else {
        const newConv = createNewConversation();
        setConversations([newConv]);
        setCurrentConversationId(newConv.id);
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
      
      // All storage operations in background - don't block UI rendering
      // Use setTimeout to ensure UI update happens first
      setTimeout(() => {
        // Save message in background (don't block UI)
        saveMessage(currentConversationId, newMessage).catch((error) => {
          console.error('Error saving message:', error);
        });
        
        // If message has audio, handle it in background
        if (newMessage.userAudioUrl && newMessage.userAudioUrl.startsWith('blob:')) {
          // Save audio to IndexedDB in background
          loadMessageWithAudio(newMessage).then((loadedMessage: Message) => {
            // Update the message with the loaded audio URL
            setMessages((prev) => 
              prev.map((msg) => 
                msg.id === loadedMessage.id ? loadedMessage : msg
              )
            );
          }).catch((error: any) => {
            console.error('Error loading audio:', error);
          });
        }
        
        // Update conversations list in background
        const updatedConversations = getConversations();
        setConversations(updatedConversations);
      }, 0);
    }
  };

  const handleRequestFeedback = async (messageId: string) => {
    const target = messages.find((m) => m.id === messageId);
    if (!target || target.type !== 'user') return;
    if (!target.transcription || !target.transcription.trim()) return;
    if (target.isSuggestedReply) return;
    if (target.correctedText) return;

    setFeedbackLoadingIds((prev) => new Set(prev).add(messageId));
    try {
      const result = await getFeedback(target.transcription);
      const updatedMessage: Message = {
        ...target,
        correctedText: result.correctedText,
        explanation: result.explanation,
      };

      // Update UI immediately
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updatedMessage : m)));

      // Persist in background
      if (currentConversationId) {
        setTimeout(() => {
          saveMessage(currentConversationId, updatedMessage).catch((error) => {
            console.error('Error saving feedback message:', error);
          });
        }, 0);
      }
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
                {getConversation(currentConversationId || '')?.title || 'Conversation'}
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
            {/* Top Bar */}
            <div className="bg-white/60 backdrop-blur-sm shadow-sm px-4 py-4 border-b border-gray-200/60 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-800">
                {getConversation(currentConversationId)?.title || 'Conversation'}
              </h2>
            </div>
            
            <div className="flex-1 min-h-0">
              <ConversationView
                messages={messages}
                isProcessing={isProcessing}
                conversationId={currentConversationId}
                onMessageSent={handleNewMessage}
                onProcessingChange={setIsProcessing}
                onRequestFeedback={handleRequestFeedback}
                feedbackLoadingIds={feedbackLoadingIds}
                onRequestFeedback={handleRequestFeedback}
                feedbackLoadingIds={feedbackLoadingIds}
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
