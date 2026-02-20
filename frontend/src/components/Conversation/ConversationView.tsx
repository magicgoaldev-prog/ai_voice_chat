import ChatArea from './ChatArea';
import RecordButton from './RecordButton';
import { Message } from '../../types';

interface ConversationViewProps {
  messages: Message[];
  isProcessing: boolean;
  conversationId: string;
  onMessageSent: (message: Message) => void;
  onProcessingChange: (processing: boolean) => void;
}

export default function ConversationView({
  messages,
  isProcessing,
  conversationId,
  onMessageSent,
  onProcessingChange,
}: ConversationViewProps) {
  return (
    <div className="flex flex-col h-full bg-gray-50 min-h-0">
      {/* Chat Area - must have min-h-0 to allow flex child to shrink */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ChatArea messages={messages} isProcessing={isProcessing} />
      </div>

      {/* Bottom Fixed Area */}
      <div className="bg-white border-t border-gray-200 p-4 flex justify-center flex-shrink-0">
        <RecordButton
          conversationId={conversationId}
          onMessageSent={onMessageSent}
          onProcessingChange={onProcessingChange}
        />
      </div>
    </div>
  );
}
