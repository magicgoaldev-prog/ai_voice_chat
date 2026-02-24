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
  autoPlayAudio: boolean;
  onToggleAutoPlayAudio: (next: boolean) => void;
  onRestartConversation: () => void;
  restartNonce: number;
  onPatchMessage: (messageId: string, patch: Partial<Message>) => void;
}

export default function ConversationView({
  messages,
  isProcessing,
  conversationId,
  onMessageSent,
  onProcessingChange,
  onRequestFeedback,
  feedbackLoadingIds,
  autoPlayAudio,
  onToggleAutoPlayAudio,
  onRestartConversation,
  restartNonce,
  onPatchMessage,
}: ConversationViewProps) {
  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-gray-50 via-blue-50/20 to-indigo-50/10 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-6 h-14 min-h-[56px] max-h-[56px] border-b border-gray-200/60 bg-white/60 backdrop-blur-sm flex-shrink-0">
        <button
          onClick={onRestartConversation}
          className="text-sm font-semibold text-blue-700 hover:text-blue-800 hover:underline leading-none"
        >
          Restart Conversation
        </button>

        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700 leading-none">Autoplay Audio</span>
          <button
            onClick={() => onToggleAutoPlayAudio(!autoPlayAudio)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              autoPlayAudio ? 'bg-blue-600' : 'bg-gray-300'
            }`}
            aria-label="Toggle autoplay audio"
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                autoPlayAudio ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Chat Area - must have min-h-0 to allow flex child to shrink */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ChatArea
          messages={messages}
          isProcessing={isProcessing}
          onRequestFeedback={onRequestFeedback}
          feedbackLoadingIds={feedbackLoadingIds}
          autoPlayAudio={autoPlayAudio}
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
          autoPlayAudio={autoPlayAudio}
          restartNonce={restartNonce}
          onPatchMessage={onPatchMessage}
        />
      </div>
    </div>
  );
}
