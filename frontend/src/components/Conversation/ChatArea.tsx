import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import { Message } from '../../types';

interface ChatAreaProps {
  messages: Message[];
  isProcessing: boolean;
  onRequestFeedback: (messageId: string) => void | Promise<void>;
  feedbackLoadingIds: Set<string>;
  autoPlayAudio: boolean;
}

export default function ChatArea({ messages, isProcessing, onRequestFeedback, feedbackLoadingIds, autoPlayAudio }: ChatAreaProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef<number>(0);
  const prevMessageIdsRef = useRef<Set<string>>(new Set());
  const newAiMessageIdRef = useRef<string | null>(null);

  // Detect newly added AI messages when messages array changes
  useEffect(() => {
    const currentIds = new Set(messages.map(m => m.id));
    const prevIds = prevMessageIdsRef.current;
    
    // Find newly added messages
    const newMessages = messages.filter(m => !prevIds.has(m.id));
    const newAiMessage = newMessages.find(m => m.type === 'ai');
    
    if (newAiMessage) {
      newAiMessageIdRef.current = newAiMessage.id;
      console.log('📨 ChatArea: New AI message detected for auto-play', {
        messageId: newAiMessage.id,
        text: newAiMessage.aiResponseText?.substring(0, 50)
      });
    } else {
      // Clear the ref after the message has been rendered
      newAiMessageIdRef.current = null;
    }
    
    // Update previous message IDs
    prevMessageIdsRef.current = currentIds;
  }, [messages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    const scrollToBottom = () => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      } else if (chatAreaRef.current) {
        // Fallback: scroll the container directly
        chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
      }
    };

    // Only scroll if new messages were added (not on initial load or deletion)
    if (messages.length > prevMessagesLengthRef.current) {
      // Small delay to ensure DOM is updated
      setTimeout(scrollToBottom, 100);
    } else if (messages.length !== prevMessagesLengthRef.current) {
      // Also scroll on other changes (like loading)
      setTimeout(scrollToBottom, 100);
    }

    prevMessagesLengthRef.current = messages.length;
  }, [messages]);

  // Also scroll when processing state changes
  useEffect(() => {
    if (isProcessing) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 100);
    }
  }, [isProcessing]);

  return (
    <div 
      ref={chatAreaRef}
      className="h-full overflow-y-auto px-4 py-6 space-y-4 max-w-4xl mx-auto w-full md:px-8 bg-transparent"
      style={{ minHeight: 0 }} // Ensure scrolling works in flex containers
    >
      {messages.length === 0 && (
        <div className="text-center mt-8 md:mt-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-blue-500">
              <path d="M12 2C10.34 2 9 3.34 9 5V11C9 12.66 10.34 14 12 14C13.66 14 15 12.66 15 11V5C15 3.34 13.66 2 12 2Z" fill="currentColor"/>
              <path d="M19 10V11C19 14.87 15.87 18 12 18C8.13 18 5 14.87 5 11V10H7V11C7 13.76 9.24 16 12 16C14.76 16 17 13.76 17 11V10H19Z" fill="currentColor"/>
              <path d="M11 22H13V19H11V22Z" fill="currentColor"/>
            </svg>
          </div>
          <p className="text-lg md:text-xl font-semibold text-gray-700 mb-2">Start practicing!</p>
          <p className="text-sm md:text-base text-gray-500">Tap the microphone to start, tap again to send</p>
        </div>
      )}
      {messages.map((message, index) => {
        // Mark AI message as new if it matches the newly added AI message ID
        const isNewMessage = message.type === 'ai' && message.id === newAiMessageIdRef.current;
        
        return (
          <MessageBubble 
            key={message.id} 
            message={message} 
            isNewMessage={isNewMessage}
            onRequestFeedback={onRequestFeedback}
            isFeedbackLoading={feedbackLoadingIds.has(message.id)}
            autoPlayAudio={autoPlayAudio}
          />
        );
      })}
      {isProcessing && (
        <div className="flex justify-center">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center space-x-3 shadow-sm">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></div>
            <span className="text-sm font-medium text-gray-700">Processing your message...</span>
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
