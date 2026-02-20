import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ConversationList from './ConversationList';
import ConversationView from './ConversationView';
import { Conversation, Message } from '../../types';
import {
  getConversations,
  createNewConversation,
  deleteConversation,
  getMessages,
  saveMessage,
  getConversation,
  loadMessagesWithAudio,
} from '../../utils/conversationStorage';

export default function ConversationScreen() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
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

  const handleNewMessage = async (newMessage: Message) => {
    if (currentConversationId) {
      // Immediately add message to UI for instant feedback
      setMessages((prev) => {
        // Ensure messages are sorted by createdAt to maintain order
        const updated = [...prev, newMessage];
        return updated.sort((a, b) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      });
      
      // Save message in background (don't block UI)
      saveMessage(currentConversationId, newMessage).catch((error) => {
        console.error('Error saving message:', error);
      });
      
      // If message has audio, handle it in background
      if (newMessage.userAudioUrl && newMessage.userAudioUrl.startsWith('blob:')) {
        // Save audio to IndexedDB in background
        loadMessageWithAudio(newMessage).then((loadedMessage) => {
          // Update the message with the loaded audio URL
          setMessages((prev) => 
            prev.map((msg) => 
              msg.id === loadedMessage.id ? loadedMessage : msg
            )
          );
        }).catch((error) => {
          console.error('Error loading audio:', error);
        });
      }
      
      // Update conversations list
      const updatedConversations = getConversations();
      setConversations(updatedConversations);
    }
  };

  // Mobile: Show list or conversation
  if (isMobileView) {
    if (showConversationList) {
      return (
        <div className="flex flex-col h-screen bg-gray-50">
          {/* Top Bar */}
          <div className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
            <h1 className="text-lg font-semibold text-gray-900">Conversations</h1>
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
      );
    } else {
      return (
        <div className="flex flex-col h-screen bg-gray-50 min-h-0">
          {/* Top Bar */}
          <div className="bg-white shadow-sm px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center">
              <button
                onClick={() => setShowConversationList(true)}
                className="mr-4 text-gray-600 hover:text-gray-900"
              >
                ← Back
              </button>
              <h1 className="text-lg font-semibold text-gray-900">
                {getConversation(currentConversationId || '')?.title || 'Conversation'}
              </h1>
            </div>
            <button
              onClick={() => navigate('/settings')}
              className="text-gray-600 hover:text-gray-900 text-sm"
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
              />
            </div>
          )}
        </div>
      );
    }
  }

  // Desktop/Tablet: Sidebar + Conversation
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-80 flex-shrink-0 border-r border-gray-200">
        <div className="h-full flex flex-col">
          {/* Top Bar */}
          <div className="bg-white shadow-sm px-4 py-3 flex items-center justify-between border-b border-gray-200">
            <h1 className="text-lg font-semibold text-gray-900">AI English Practice</h1>
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
            <div className="bg-white shadow-sm px-4 py-3 border-b border-gray-200 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">
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
