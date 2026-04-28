import { RefreshCw } from 'lucide-react';

import { useTeletonStore } from '../../shared/store/useTeletonStore';
import { ChatList } from '../../widgets/ChatList';
import { InputBar } from '../../widgets/InputBar';
import { MessageWindow } from '../../widgets/MessageWindow';

export function ChatScreen() {
  const chats = useTeletonStore((state) => state.chats);
  const selectedChatId = useTeletonStore((state) => state.selectedChatId);
  const messages = useTeletonStore((state) => (selectedChatId ? state.messagesByChat[selectedChatId] ?? [] : []));
  const selectChat = useTeletonStore((state) => state.selectChat);
  const loadChats = useTeletonStore((state) => state.loadChats);
  const sendMessage = useTeletonStore((state) => state.sendMessage);
  const selectedChat = chats.find((chat) => chat.id === selectedChatId);

  return (
    <section className="grid h-screen min-h-0 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="min-h-0 border-r border-mist bg-white">
        <div className="flex h-16 items-center justify-between border-b border-mist px-4">
          <h1 className="text-base font-semibold">Chats</h1>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center border border-mist text-ink/64 hover:bg-paper hover:text-ink"
            title="Refresh chats"
            aria-label="Refresh chats"
            onClick={() => void loadChats()}
          >
            <RefreshCw size={17} />
          </button>
        </div>
        <ChatList chats={chats} selectedChatId={selectedChatId} onSelect={(chatId) => void selectChat(chatId)} />
      </div>
      <div className="grid min-h-0 grid-rows-[1fr_auto] bg-paper">
        <MessageWindow chat={selectedChat} messages={messages} />
        <InputBar disabled={!selectedChatId} onSend={(text) => void sendMessage(text)} />
      </div>
    </section>
  );
}
