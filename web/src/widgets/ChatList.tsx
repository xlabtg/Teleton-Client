import type { ChatSummary } from '../shared/types';

interface ChatListProps {
  chats: ChatSummary[];
  selectedChatId?: number;
  onSelect: (chatId: number) => void;
}

export function ChatList({ chats, selectedChatId, onSelect }: ChatListProps) {
  if (chats.length === 0) {
    return <div className="p-4 text-sm text-ink/58">No chats loaded.</div>;
  }

  return (
    <div className="scrollbar-thin max-h-[calc(100vh-4rem)] overflow-y-auto">
      {chats.map((chat) => (
        <button
          key={chat.id}
          type="button"
          className={`grid w-full grid-cols-[1fr_auto] gap-2 border-b border-mist px-4 py-3 text-left hover:bg-paper ${
            selectedChatId === chat.id ? 'bg-mist/70' : 'bg-white'
          }`}
          onClick={() => onSelect(chat.id)}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{chat.title}</span>
            <span className="block truncate text-xs text-ink/58">{chat.lastMessage || 'No recent message'}</span>
          </span>
          {chat.unreadCount > 0 && (
            <span className="grid h-6 min-w-6 place-items-center bg-mint px-2 text-xs font-semibold text-white">
              {chat.unreadCount}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
