import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import { Message } from '../../types';

interface ChatAreaProps {
  messages: Message[];
  isProcessing: boolean;
}

export default function ChatArea({ messages, isProcessing }: ChatAreaProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef<number>(0);

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
      className="h-full overflow-y-auto px-4 py-6 space-y-4 max-w-4xl mx-auto w-full md:px-8"
      style={{ minHeight: 0 }} // Ensure scrolling works in flex containers
    >
      {messages.length === 0 && (
        <div className="text-center text-gray-500 mt-8 md:mt-16">
          <p className="text-lg md:text-xl mb-2">👋 Start practicing!</p>
          <p className="text-sm md:text-base">Press the microphone button to record your message.</p>
        </div>
      )}
      {messages.map((message, index) => {
        // Mark AI message as new if it's the last message and it's an AI message
        // This ensures auto-play only happens for the most recent AI response
        const isNewMessage = index === messages.length - 1 && message.type === 'ai';
        
        // Debug logging for new messages
        if (isNewMessage) {
          console.log('📨 ChatArea: New AI message detected', {
            messageId: message.id,
            index,
            totalMessages: messages.length,
            text: message.aiResponseText?.substring(0, 50)
          });
        }
        
        return (
          <MessageBubble 
            key={message.id} 
            message={message} 
            isNewMessage={isNewMessage}
          />
        );
      })}
      {isProcessing && (
        <div className="flex justify-center">
          <div className="bg-gray-200 rounded-lg px-4 py-2 flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
            <span className="text-gray-600">Processing your message...</span>
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
