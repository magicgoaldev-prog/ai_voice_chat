import { Conversation, Message } from '../../types';

interface ConversationListProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onCreateConversation: () => void;
  onDeleteConversation?: (conversationId: string) => void;
}

export default function ConversationList({
  conversations,
  currentConversationId,
  onSelectConversation,
  onCreateConversation,
  onDeleteConversation,
}: ConversationListProps) {
  const formatTime = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div className="flex flex-col h-full bg-white/60 backdrop-blur-sm">
      {/* Header */}
      <div className="p-4 border-b border-gray-200/60">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Conversations</h2>
          <button
            onClick={onCreateConversation}
            className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center hover:from-blue-600 hover:to-blue-700 shadow-md transition-all active:scale-95 text-lg font-light"
            aria-label="New conversation"
          >
            +
          </button>
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-6 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-blue-500">
                <path d="M20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4ZM20 18H4V8L12 13L20 8V18ZM12 11L4 6H20L12 11Z" fill="currentColor"/>
              </svg>
            </div>
            <p className="text-sm text-gray-600 mb-4">No conversations yet</p>
            <button
              onClick={onCreateConversation}
              className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 shadow-md transition-all font-medium text-sm"
            >
              Start New Conversation
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100/50">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                onClick={() => onSelectConversation(conversation.id)}
                className={`p-4 cursor-pointer transition-all ${
                  currentConversationId === conversation.id 
                    ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500' 
                    : 'hover:bg-gray-50/80'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 truncate mb-1">
                      {conversation.title || 'New Conversation'}
                    </h3>
                    {conversation.lastMessage && (
                      <p className="text-xs text-gray-600 truncate leading-relaxed">
                        {conversation.lastMessage}
                      </p>
                    )}
                  </div>
                  {conversation.lastMessageAt && (
                    <span className="text-xs text-gray-400 ml-2 flex-shrink-0 font-medium">
                      {formatTime(conversation.lastMessageAt)}
                    </span>
                  )}
                </div>
                {onDeleteConversation && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Delete this conversation?')) {
                        onDeleteConversation(conversation.id);
                      }
                    }}
                    className="mt-2 text-xs text-red-600 hover:text-red-700 font-medium transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
