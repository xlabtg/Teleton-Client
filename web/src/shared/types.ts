export type AuthStatus =
  | 'idle'
  | 'initializing'
  | 'phone-required'
  | 'code-required'
  | 'password-required'
  | 'ready'
  | 'error';

export interface ChatSummary {
  id: number;
  title: string;
  unreadCount: number;
  lastMessage?: string;
  updatedAt?: number;
}

export interface ChatMessage {
  id: number;
  chatId: number;
  sender: 'me' | 'them' | 'system';
  text: string;
  createdAt: number;
  pending?: boolean;
}

export type ProxyType = 'none' | 'socks5' | 'mtproto';

export interface ProxySettings {
  enabled: boolean;
  type: ProxyType;
  host: string;
  port: number;
  username?: string;
  password?: string;
  secret?: string;
}

export interface AgentSettings {
  wsUrl: string;
  managementUrl: string;
  managementApiKey?: string;
  enabled: boolean;
}

export type AgentConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface AgentStatus {
  connection: AgentConnectionState;
  lifecycle?: 'stopped' | 'starting' | 'running' | 'stopping';
  error?: string;
  uptime?: number;
}

export interface TonBalance {
  address: string;
  balance: string;
  currency: 'TON';
}

export interface TonTransactionDraft {
  to: string;
  amount: string;
  comment?: string;
}

export interface UiNotice {
  id: string;
  tone: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface PersistedSettings {
  proxy: ProxySettings;
  agent: AgentSettings;
  consentedAt: string;
}
