import type { ChatMessage, ChatSummary } from '../shared/types';

interface MessageWindowProps {
  chat?: ChatSummary;
  messages: ChatMessage[];
}

export function MessageWindow({ chat, messages }: MessageWindowProps) {
  return (
    <div className="grid min-h-0 grid-rows-[64px_minmax(0,1fr)]">
      <header className="flex items-center border-b border-mist bg-white px-5">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{chat?.title ?? 'Select a chat'}</h2>
          <p className="text-xs text-ink/58">{chat ? `${messages.length} loaded messages` : 'Telegram TDLib session'}</p>
        </div>
      </header>
      <div className="scrollbar-thin min-h-0 space-y-3 overflow-y-auto px-4 py-5 sm:px-6">
        {messages.length === 0 && <p className="text-sm text-ink/58">No messages loaded.</p>}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[82%] border px-4 py-3 text-sm leading-6 shadow-sm ${
              message.sender === 'me'
                ? 'ml-auto border-teal/25 bg-teal text-white'
                : message.sender === 'system'
                  ? 'mx-auto border-saffron/30 bg-saffron/10 text-ink'
                  : 'mr-auto border-mist bg-white text-ink'
            }`}
          >
            <p className="whitespace-pre-wrap break-words">{message.text}</p>
            <span className="mt-2 block text-[11px] opacity-70">
              {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {message.pending ? ' pending' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
