import { create } from 'zustand';

import { TeletonAgentService, getManagementAgentStatus } from '../../services/agent.service';
import { clearEncryptedSettings, loadEncryptedSettings, saveEncryptedSettings } from '../../services/crypto.service';
import { defaultProxySettings, validateProxySettings } from '../../services/proxy.service';
import { TdlibService } from '../../services/tdlib.service';
import type {
  AgentSettings,
  AgentStatus,
  AuthStatus,
  ChatMessage,
  ChatSummary,
  PersistedSettings,
  ProxySettings,
  TonBalance,
  TonTransactionDraft,
  UiNotice
} from '../types';

interface TeletonState {
  authStatus: AuthStatus;
  authError?: string;
  qrLoginLink?: string;
  qrLoginUpdatedAt?: string;
  sessionId: string;
  chats: ChatSummary[];
  messagesByChat: Record<number, ChatMessage[]>;
  selectedChatId?: number;
  proxy: ProxySettings;
  agent: AgentSettings;
  agentStatus: AgentStatus;
  tonBalance?: TonBalance;
  notices: UiNotice[];
  bootstrapped: boolean;
  bootstrap: () => Promise<void>;
  initializeTelegram: () => Promise<void>;
  restartTelegramAuth: () => Promise<void>;
  requestQrLogin: () => Promise<void>;
  submitPhone: (phoneNumber: string) => Promise<void>;
  submitCode: (code: string) => Promise<void>;
  submitPassword: (password: string) => Promise<void>;
  loadChats: () => Promise<void>;
  selectChat: (chatId: number) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  setProxyDraft: (proxy: ProxySettings) => void;
  applyProxy: () => Promise<void>;
  setAgentSettings: (settings: AgentSettings) => void;
  saveSettings: () => Promise<void>;
  clearSettings: () => Promise<void>;
  connectAgent: () => Promise<void>;
  disconnectAgent: () => void;
  enableAgent: () => Promise<void>;
  disableAgent: () => Promise<void>;
  checkManagementStatus: () => Promise<void>;
  getTonBalance: (address: string) => Promise<void>;
  sendTonTx: (draft: TonTransactionDraft) => Promise<string>;
  dismissNotice: (id: string) => void;
}

const tdlibService = new TdlibService();
const agentService = new TeletonAgentService();

function defaultAgentSettings(): AgentSettings {
  return {
    wsUrl: import.meta.env.VITE_TELETON_AGENT_WS_URL || 'ws://localhost:8765',
    managementUrl: import.meta.env.VITE_TELETON_AGENT_MANAGEMENT_URL || 'https://localhost:7778',
    enabled: false
  };
}

function createSessionId() {
  if ('crypto' in globalThis && 'randomUUID' in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }

  return `session_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function notice(tone: UiNotice['tone'], message: string): UiNotice {
  return {
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    tone,
    message
  };
}

function authStatusFromTdlibState(stateType: unknown): AuthStatus | null {
  switch (stateType) {
    case 'authorizationStateWaitPhoneNumber':
      return 'phone-required';
    case 'authorizationStateWaitOtherDeviceConfirmation':
      return 'qr-required';
    case 'authorizationStateWaitCode':
      return 'code-required';
    case 'authorizationStateWaitPassword':
      return 'password-required';
    case 'authorizationStateReady':
      return 'ready';
    case 'authorizationStateClosed':
      return 'idle';
    default:
      return null;
  }
}

function addNotice(set: (partial: Partial<TeletonState>) => void, get: () => TeletonState, entry: UiNotice) {
  set({ notices: [entry, ...get().notices].slice(0, 5) });
}

export const useTeletonStore = create<TeletonState>((set, get) => ({
  authStatus: 'idle',
  sessionId: createSessionId(),
  chats: [],
  messagesByChat: {},
  proxy: defaultProxySettings(),
  agent: defaultAgentSettings(),
  agentStatus: { connection: 'disconnected' },
  notices: [],
  bootstrapped: false,

  async bootstrap() {
    try {
      const stored = await loadEncryptedSettings();
      if (stored) {
        set({
          proxy: stored.proxy,
          agent: stored.agent,
          bootstrapped: true
        });
        return;
      }
    } catch (error) {
      addNotice(set, get, notice('warning', error instanceof Error ? error.message : 'Encrypted settings could not be loaded.'));
    }

    set({ bootstrapped: true });
  },

  async initializeTelegram() {
    set({ authStatus: 'initializing', authError: undefined, qrLoginLink: undefined, qrLoginUpdatedAt: undefined });

    const apiId = Number(import.meta.env.VITE_TELEGRAM_API_ID);
    const apiHash = import.meta.env.VITE_TELEGRAM_API_HASH?.trim() ?? '';

    try {
      await tdlibService.init({
        apiId,
        apiHash,
        logVerbosityLevel: Number(import.meta.env.VITE_TDLIB_LOG_VERBOSITY ?? 2),
        onUpdate: (update) => {
          const authorizationState = update.authorization_state as Record<string, unknown> | undefined;
          const nextAuthStatus = authStatusFromTdlibState(authorizationState?.['@type']);

          if (nextAuthStatus) {
            const nextAuthState: Partial<TeletonState> = { authStatus: nextAuthStatus };
            if (nextAuthStatus === 'qr-required') {
              const qrLink = authorizationState?.link;
              if (typeof qrLink === 'string') {
                nextAuthState.qrLoginLink = qrLink;
                nextAuthState.qrLoginUpdatedAt = new Date().toISOString();
              }
            } else {
              nextAuthState.qrLoginLink = undefined;
              nextAuthState.qrLoginUpdatedAt = undefined;
            }

            set(nextAuthState);
            if (nextAuthStatus === 'ready') void get().loadChats();
          }

          if (update['@type'] === 'updateNewMessage') {
            const message = update.message as ChatMessage | undefined;
            if (message?.chatId) {
              set({
                messagesByChat: {
                  ...get().messagesByChat,
                  [message.chatId]: [...(get().messagesByChat[message.chatId] ?? []), message]
                }
              });
            }
          }
        }
      });

      set({ authStatus: 'phone-required', qrLoginLink: undefined, qrLoginUpdatedAt: undefined });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'TDLib initialization failed.';
      set({ authStatus: 'error', authError: message, qrLoginLink: undefined, qrLoginUpdatedAt: undefined });
      addNotice(set, get, notice('error', message));
    }
  },

  async restartTelegramAuth() {
    tdlibService.close();
    set({ authStatus: 'initializing', authError: undefined, qrLoginLink: undefined, qrLoginUpdatedAt: undefined });
    await get().initializeTelegram();
  },

  async requestQrLogin() {
    try {
      if (get().authStatus === 'qr-required') {
        tdlibService.close();
        await get().initializeTelegram();
      }

      set({ authStatus: 'qr-required', authError: undefined, qrLoginLink: undefined, qrLoginUpdatedAt: undefined });
      await tdlibService.requestQrCodeAuthentication();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'QR authentication failed.';
      set({ authStatus: 'phone-required', authError: message, qrLoginLink: undefined, qrLoginUpdatedAt: undefined });
      addNotice(set, get, notice('error', message));
    }
  },

  async submitPhone(phoneNumber) {
    try {
      await tdlibService.authPhone(phoneNumber);
      set({ authStatus: 'code-required', authError: undefined, qrLoginLink: undefined, qrLoginUpdatedAt: undefined });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Phone authentication failed.';
      set({ authStatus: 'error', authError: message });
      addNotice(set, get, notice('error', message));
    }
  },

  async submitCode(code) {
    try {
      await tdlibService.authCode(code);
      set({ authError: undefined });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Code authentication failed.';
      set({ authStatus: 'code-required', authError: message });
      addNotice(set, get, notice('error', message));
    }
  },

  async submitPassword(password) {
    try {
      await tdlibService.authPassword(password);
      set({ authError: undefined });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Password authentication failed.';
      set({ authStatus: 'password-required', authError: message });
      addNotice(set, get, notice('error', message));
    }
  },

  async loadChats() {
    try {
      const chats = await tdlibService.getChats();
      set({
        chats,
        selectedChatId: get().selectedChatId ?? chats[0]?.id
      });
    } catch (error) {
      addNotice(set, get, notice('warning', error instanceof Error ? error.message : 'Chats could not be loaded.'));
    }
  },

  async selectChat(chatId) {
    set({ selectedChatId: chatId });

    try {
      const messages = await tdlibService.getMessages(chatId);
      set({
        messagesByChat: {
          ...get().messagesByChat,
          [chatId]: messages
        }
      });
    } catch (error) {
      addNotice(set, get, notice('warning', error instanceof Error ? error.message : 'Messages could not be loaded.'));
    }
  },

  async sendMessage(text) {
    const selectedChatId = get().selectedChatId;
    if (!selectedChatId || !text.trim()) return;

    const optimistic: ChatMessage = {
      id: Date.now(),
      chatId: selectedChatId,
      sender: 'me',
      text: text.trim(),
      createdAt: Date.now(),
      pending: true
    };

    set({
      messagesByChat: {
        ...get().messagesByChat,
        [selectedChatId]: [...(get().messagesByChat[selectedChatId] ?? []), optimistic]
      }
    });

    try {
      await tdlibService.sendMessage(selectedChatId, text.trim());
    } catch (error) {
      addNotice(set, get, notice('error', error instanceof Error ? error.message : 'Message send failed.'));
    }
  },

  setProxyDraft(proxy) {
    set({ proxy });
  },

  async applyProxy() {
    const validation = validateProxySettings(get().proxy);
    if (!validation.valid || !validation.normalized) {
      addNotice(set, get, notice('error', validation.errors.join(' ')));
      return;
    }

    set({ proxy: validation.normalized });

    try {
      if (tdlibService.initialized) {
        await tdlibService.setProxy(validation.normalized);
      }
      await get().saveSettings();
      addNotice(set, get, notice('success', 'Proxy settings applied.'));
    } catch (error) {
      addNotice(set, get, notice('error', error instanceof Error ? error.message : 'Proxy settings failed.'));
    }
  },

  setAgentSettings(settings) {
    set({ agent: settings });
  },

  async saveSettings() {
    const persisted: PersistedSettings = {
      proxy: get().proxy,
      agent: get().agent,
      consentedAt: new Date().toISOString()
    };
    await saveEncryptedSettings(persisted);
  },

  async clearSettings() {
    await clearEncryptedSettings();
    set({
      proxy: defaultProxySettings(),
      agent: defaultAgentSettings()
    });
    addNotice(set, get, notice('success', 'Encrypted settings cleared.'));
  },

  async connectAgent() {
    set({ agentStatus: { connection: 'connecting' } });

    try {
      await agentService.connect(get().agent.wsUrl);
      set({ agentStatus: { connection: 'connected' } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Agent connection failed.';
      set({ agentStatus: { connection: 'error', error: message } });
      addNotice(set, get, notice('error', message));
    }
  },

  disconnectAgent() {
    agentService.disconnect();
    set({ agentStatus: { connection: 'disconnected' } });
  },

  async enableAgent() {
    if (!agentService.connected) await get().connectAgent();
    await agentService.enable({ session: get().sessionId });
    set({ agent: { ...get().agent, enabled: true } });
    await get().saveSettings();
  },

  async disableAgent() {
    if (agentService.connected) await agentService.disable();
    set({ agent: { ...get().agent, enabled: false } });
    await get().saveSettings();
  },

  async checkManagementStatus() {
    try {
      const status = await getManagementAgentStatus({
        baseUrl: get().agent.managementUrl,
        apiKey: get().agent.managementApiKey
      });
      set({ agentStatus: status });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Management API status failed.';
      set({ agentStatus: { connection: 'error', error: message } });
      addNotice(set, get, notice('warning', message));
    }
  },

  async getTonBalance(address) {
    if (!agentService.connected) await get().connectAgent();
    const balance = await agentService.getTonBalance(address);
    set({ tonBalance: balance });
  },

  async sendTonTx(draft) {
    if (!agentService.connected) await get().connectAgent();
    const result = await agentService.sendTx(draft);
    addNotice(set, get, notice('success', `Transaction submitted: ${result.txHash}`));
    return result.txHash;
  },

  dismissNotice(id) {
    set({ notices: get().notices.filter((entry) => entry.id !== id) });
  }
}));
