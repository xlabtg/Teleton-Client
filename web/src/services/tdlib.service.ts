import type { ChatMessage, ChatSummary, ProxySettings } from '../shared/types';
import { validateProxySettings } from './proxy.service';

interface TdlibOptions {
  apiId: number;
  apiHash: string;
  logVerbosityLevel?: number;
  onUpdate?: (update: Record<string, unknown>) => void;
}

interface TdClientConstructor {
  new (options: Record<string, unknown>): {
    send(query: Record<string, unknown>): Promise<Record<string, unknown>>;
    close?: () => void;
  };
}

declare global {
  interface Window {
    tdweb?: TdClientConstructor;
  }
}

const TDWEB_SCRIPT = '/tdweb.js';

function appendScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Unable to load ${src}. Run npm install in web/ to copy tdweb assets.`));
    document.head.append(script);
  });
}

async function loadTdClientConstructor(): Promise<TdClientConstructor> {
  if (window.tdweb) return window.tdweb;

  try {
    await appendScript(TDWEB_SCRIPT);
    if (window.tdweb) return window.tdweb;
  } catch {
    // Fall through to the npm module path for test/build environments that provide a bundler shim.
  }

  const tdwebModule = await import(/* @vite-ignore */ 'tdweb');
  const candidate = tdwebModule.default as unknown;
  if (typeof candidate === 'function') return candidate as TdClientConstructor;

  throw new Error('tdweb did not expose a TdClient constructor.');
}

function textFromMessage(message: Record<string, unknown> | undefined) {
  const content = message?.content as Record<string, unknown> | undefined;
  const text = content?.text as Record<string, unknown> | undefined;
  const value = text?.text;
  return typeof value === 'string' ? value : '';
}

function normalizeChat(chat: Record<string, unknown>): ChatSummary {
  const lastMessage = chat.last_message as Record<string, unknown> | undefined;

  return {
    id: Number(chat.id),
    title: String(chat.title ?? 'Untitled chat'),
    unreadCount: Number(chat.unread_count ?? 0),
    lastMessage: textFromMessage(lastMessage),
    updatedAt: Number(lastMessage?.date ?? 0)
  };
}

function normalizeMessage(chatId: number, message: Record<string, unknown>, userId?: number): ChatMessage {
  const senderId = message.sender_id as Record<string, unknown> | undefined;
  const senderUserId = Number(senderId?.user_id ?? 0);

  return {
    id: Number(message.id),
    chatId,
    sender: senderUserId && senderUserId === userId ? 'me' : 'them',
    text: textFromMessage(message),
    createdAt: Number(message.date ?? Date.now() / 1000) * 1000
  };
}

export class TdlibService {
  private client: InstanceType<TdClientConstructor> | null = null;
  private apiId = 0;
  private apiHash = '';
  private currentUserId?: number;
  private onUpdate?: (update: Record<string, unknown>) => void;
  private parametersSent = false;

  get initialized() {
    return Boolean(this.client);
  }

  async init(options: TdlibOptions) {
    if (!Number.isInteger(options.apiId) || options.apiId <= 0 || !options.apiHash.trim()) {
      throw new Error('Telegram API credentials are required.');
    }

    this.apiId = options.apiId;
    this.apiHash = options.apiHash.trim();
    this.onUpdate = options.onUpdate;

    const TdClient = await loadTdClientConstructor();
    this.client = new TdClient({
      instanceName: 'teleton-web-alpha',
      mode: 'wasm',
      useDatabase: true,
      readOnly: false,
      jsLogVerbosityLevel: 'warning',
      logVerbosityLevel: options.logVerbosityLevel ?? 2,
      onUpdate: (update: Record<string, unknown>) => {
        void this.handleUpdate(update);
        this.onUpdate?.(update);
      }
    });

    await this.send({ '@type': 'getAuthorizationState' });
  }

  async authPhone(phoneNumber: string) {
    await this.ensureParameters();
    return this.send({
      '@type': 'setAuthenticationPhoneNumber',
      phone_number: phoneNumber.trim(),
      settings: {
        '@type': 'phoneNumberAuthenticationSettings',
        allow_flash_call: false,
        allow_missed_call: false,
        is_current_phone_number: false,
        allow_sms_retriever_api: false
      }
    });
  }

  authCode(code: string) {
    return this.send({
      '@type': 'checkAuthenticationCode',
      code: code.trim()
    });
  }

  authPassword(password: string) {
    return this.send({
      '@type': 'checkAuthenticationPassword',
      password
    });
  }

  async getChats(limit = 30): Promise<ChatSummary[]> {
    const result = await this.send({
      '@type': 'getChats',
      chat_list: { '@type': 'chatListMain' },
      limit
    });
    const chatIds = Array.isArray(result.chat_ids) ? result.chat_ids.slice(0, limit) : [];
    const chats = await Promise.all(chatIds.map((id) => this.send({ '@type': 'getChat', chat_id: id })));
    return chats.map(normalizeChat).sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
  }

  async getMessages(chatId: number, limit = 40): Promise<ChatMessage[]> {
    const result = await this.send({
      '@type': 'getChatHistory',
      chat_id: chatId,
      from_message_id: 0,
      offset: 0,
      limit,
      only_local: false
    });
    const messages = Array.isArray(result.messages) ? result.messages : [];
    return messages.map((message) => normalizeMessage(chatId, message as Record<string, unknown>, this.currentUserId)).reverse();
  }

  sendMessage(chatId: number, text: string) {
    return this.send({
      '@type': 'sendMessage',
      chat_id: chatId,
      input_message_content: {
        '@type': 'inputMessageText',
        text: {
          '@type': 'formattedText',
          text,
          entities: []
        },
        disable_web_page_preview: true,
        clear_draft: true
      }
    });
  }

  async setProxy(proxy: ProxySettings) {
    const validation = validateProxySettings(proxy);
    if (!validation.valid || !validation.normalized) {
      throw new Error(validation.errors.join(' '));
    }

    if (!validation.normalized.enabled) {
      return this.send({ '@type': 'disableProxy' });
    }

    const type =
      validation.normalized.type === 'socks5'
        ? {
            '@type': 'proxyTypeSocks5',
            username: validation.normalized.username ?? '',
            password: validation.normalized.password ?? ''
          }
        : {
            '@type': 'proxyTypeMtproto',
            secret: validation.normalized.secret ?? ''
          };

    const added = await this.send({
      '@type': 'addProxy',
      server: validation.normalized.host,
      port: validation.normalized.port,
      enable: true,
      type
    });

    const proxyId = Number(added.id ?? 0);
    if (proxyId) {
      await this.send({ '@type': 'enableProxy', proxy_id: proxyId });
    }

    return added;
  }

  close() {
    this.client?.close?.();
    this.client = null;
  }

  private async handleUpdate(update: Record<string, unknown>) {
    const type = update['@type'];
    const authorizationState = update.authorization_state as Record<string, unknown> | undefined;

    if (type === 'updateAuthorizationState' && authorizationState?.['@type'] === 'authorizationStateWaitTdlibParameters') {
      await this.ensureParameters();
    }

    if (type === 'updateAuthorizationState' && authorizationState?.['@type'] === 'authorizationStateWaitEncryptionKey') {
      await this.send({ '@type': 'checkDatabaseEncryptionKey', encryption_key: '' });
    }

    if (type === 'updateAuthorizationState' && authorizationState?.['@type'] === 'authorizationStateReady') {
      const me = await this.send({ '@type': 'getMe' });
      this.currentUserId = Number(me.id ?? 0);
    }
  }

  private async ensureParameters() {
    if (this.parametersSent) {
      return { '@type': 'ok' };
    }

    this.parametersSent = true;

    try {
      return await this.send({
        '@type': 'setTdlibParameters',
        use_test_dc: false,
        database_directory: 'teleton-web-db',
        files_directory: 'teleton-web-files',
        use_file_database: true,
        use_chat_info_database: true,
        use_message_database: true,
        use_secret_chats: false,
        api_id: this.apiId,
        api_hash: this.apiHash,
        system_language_code: navigator.language || 'en',
        device_model: 'Teleton Web',
        system_version: navigator.userAgent,
        application_version: '0.1.0-alpha.0',
        enable_storage_optimizer: true,
        ignore_file_names: false
      });
    } catch (error) {
      this.parametersSent = false;
      throw error;
    }
  }

  private send(query: Record<string, unknown>) {
    if (!this.client) {
      throw new Error('TDLib is not initialized.');
    }

    return this.client.send(query);
  }
}
