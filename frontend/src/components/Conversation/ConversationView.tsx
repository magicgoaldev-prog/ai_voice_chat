import ChatArea from './ChatArea';
import MessageComposer from './MessageComposer';
import { Message } from '../../types';

interface ConversationViewProps {
  messages: Message[];
  isProcessing: boolean;
  conversationId: string;
  onMessageSent: (message: Message) => void;
  onProcessingChange: (processing: boolean) => void;
  onRequestFeedback: (messageId: string) => void | Promise<void>;
  feedbackLoadingIds: Set<string>;
}

export default function ConversationView({
  messages,
  isProcessing,
  conversationId,
  onMessageSent,
  onProcessingChange,
  onRequestFeedback,
  feedbackLoadingIds,
}: ConversationViewProps) {
  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-gray-50 via-blue-50/20 to-indigo-50/10 min-h-0">
      {/* Chat Area - must have min-h-0 to allow flex child to shrink */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ChatArea
          messages={messages}
          isProcessing={isProcessing}
          onRequestFeedback={onRequestFeedback}
          feedbackLoadingIds={feedbackLoadingIds}
        />
      </div>

      {/* Bottom Fixed Area */}
      <div className="bg-white/80 backdrop-blur-sm border-t border-gray-200/60 p-6 flex justify-center flex-shrink-0 shadow-lg">
        <MessageComposer
          conversationId={conversationId}
          messages={messages}
          isProcessing={isProcessing}
          onMessageSent={onMessageSent}
          onProcessingChange={onProcessingChange}
        />
      </div>
    </div>
  );
}
