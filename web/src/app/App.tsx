import { TonConnectUIProvider } from '@tonconnect/ui-react';
import { Bot, MessageCircle, Settings, WalletCards, X } from 'lucide-react';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import { AgentPanel } from '../features/agent/AgentPanel';
import { AuthScreen } from '../features/auth/AuthScreen';
import { ChatScreen } from '../features/chat/ChatScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { TonPanel } from '../features/ton/TonPanel';
import { useTeletonStore } from '../shared/store/useTeletonStore';

const views = [
  { id: 'chats', label: 'Chats', icon: MessageCircle },
  { id: 'agent', label: 'Agent', icon: Bot },
  { id: 'ton', label: 'TON', icon: WalletCards },
  { id: 'settings', label: 'Settings', icon: Settings }
] as const;

type ViewId = (typeof views)[number]['id'];

function isView(value: string | null): value is ViewId {
  return views.some((view) => view.id === value);
}

function NoticeStack() {
  const notices = useTeletonStore((state) => state.notices);
  const dismissNotice = useTeletonStore((state) => state.dismissNotice);

  return (
    <div className="fixed right-4 top-4 z-30 flex w-[min(92vw,420px)] flex-col gap-2">
      {notices.map((entry) => (
        <div
          key={entry.id}
          className="flex items-start gap-3 border border-mist bg-white px-4 py-3 text-sm shadow-panel"
          role="status"
        >
          <span
            className={
              entry.tone === 'error'
                ? 'mt-1 h-2.5 w-2.5 shrink-0 bg-coral'
                : entry.tone === 'warning'
                  ? 'mt-1 h-2.5 w-2.5 shrink-0 bg-saffron'
                  : entry.tone === 'success'
                    ? 'mt-1 h-2.5 w-2.5 shrink-0 bg-mint'
                    : 'mt-1 h-2.5 w-2.5 shrink-0 bg-teal'
            }
          />
          <p className="min-w-0 flex-1 leading-5">{entry.message}</p>
          <button
            type="button"
            className="grid h-7 w-7 place-items-center text-ink/65 hover:text-ink"
            aria-label="Dismiss notice"
            onClick={() => dismissNotice(entry.id)}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function App() {
  const [searchParams, setSearchParams] = useSearchParams();
  const bootstrap = useTeletonStore((state) => state.bootstrap);
  const authStatus = useTeletonStore((state) => state.authStatus);
  const view = isView(searchParams.get('view')) ? searchParams.get('view') : 'chats';
  const showMobileNav = view !== 'chats' || authStatus === 'ready';

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const setView = (next: ViewId) => {
    setSearchParams({ view: next });
  };

  return (
    <TonConnectUIProvider manifestUrl={import.meta.env.VITE_TONCONNECT_MANIFEST_URL || '/tonconnect-manifest.json'}>
      <div className="min-h-screen bg-paper text-ink">
        <NoticeStack />
        <div className="grid min-h-screen grid-cols-1 md:grid-cols-[88px_minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)]">
          <aside className="hidden border-r border-mist bg-white md:flex md:flex-col">
            <div className="flex h-20 items-center gap-3 border-b border-mist px-5">
              <img src="/icons/icon-192.png" alt="" className="h-9 w-9" />
              <div className="hidden xl:block">
                <p className="text-sm font-semibold">Teleton Client</p>
                <p className="text-xs text-ink/58">Alpha Web</p>
              </div>
            </div>
            <nav className="flex flex-1 flex-col gap-1 px-3 py-5" aria-label="Primary">
              {views.map((item) => {
                const Icon = item.icon;
                const active = view === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={item.label}
                    title={item.label}
                    className={`flex h-12 items-center justify-center gap-3 border px-3 text-sm font-medium xl:justify-start ${
                      active
                        ? 'border-teal bg-teal text-white'
                        : 'border-transparent text-ink/68 hover:border-mist hover:bg-paper'
                    }`}
                    onClick={() => setView(item.id)}
                  >
                    <Icon size={20} />
                    <span className="hidden xl:inline">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <main className={`min-w-0 ${showMobileNav ? 'pb-20' : 'pb-0'} md:pb-0`}>
            {view === 'chats' && (authStatus === 'ready' ? <ChatScreen /> : <AuthScreen />)}
            {view === 'agent' && <AgentPanel />}
            {view === 'ton' && <TonPanel />}
            {view === 'settings' && <SettingsScreen />}
          </main>

          {showMobileNav && (
            <nav
              className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-mist bg-white md:hidden"
              aria-label="Primary"
            >
              {views.map((item) => {
                const Icon = item.icon;
                const active = view === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`grid h-16 place-items-center text-xs font-medium ${
                      active ? 'text-teal' : 'text-ink/62 hover:text-ink'
                    }`}
                    onClick={() => setView(item.id)}
                  >
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          )}
        </div>
      </div>
    </TonConnectUIProvider>
  );
}
