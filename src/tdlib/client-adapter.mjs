import { isSecureReference } from '../foundation/proxy-settings.mjs';
import { logNetworkError } from '../foundation/network-error-logger.mjs';

export const TDLIB_PLATFORMS = Object.freeze(['android', 'ios', 'desktop', 'web']);
export const TDLIB_UPDATE_TYPES = Object.freeze(['authorizationState', 'connectionState', 'chatList', 'message']);

const REQUIRED_IMPLEMENTATION_METHODS = ['authenticate', 'getChatList', 'sendMessage', 'subscribeUpdates'];
const OPTIONAL_PROXY_METHODS = ['enableProxy', 'updateProxy', 'disableProxy', 'removeProxy'];
const MAX_CHAT_LIST_LIMIT = 100;
const MAX_MESSAGE_TEXT_LENGTH = 4096;

export class TdlibAdapterError extends Error {
  constructor(message, code, details = []) {
    super(message);
    this.name = 'TdlibAdapterError';
    this.code = code;
    this.details = details;
  }
}

function adapterError(errors, code) {
  return new TdlibAdapterError(errors.join(' '), code, errors);
}

function normalizePlatform(value) {
  const platform = String(value ?? '').trim().toLowerCase();

  if (!TDLIB_PLATFORMS.includes(platform)) {
    throw new TdlibAdapterError(`Unsupported TDLib platform: ${value}`, 'unsupported_platform');
  }

  return platform;
}

function assertBridgeImplementation(implementation) {
  if (!implementation || typeof implementation !== 'object') {
    throw new TdlibAdapterError('TDLib adapter implementation must be an object.', 'invalid_implementation');
  }

  const missingMethods = REQUIRED_IMPLEMENTATION_METHODS.filter((method) => typeof implementation[method] !== 'function');
  if (missingMethods.length > 0) {
    throw new TdlibAdapterError(
      `TDLib adapter implementation is missing methods: ${missingMethods.join(', ')}.`,
      'invalid_implementation',
      missingMethods
    );
  }

  const invalidProxyMethods = OPTIONAL_PROXY_METHODS.filter(
    (method) => implementation[method] !== undefined && typeof implementation[method] !== 'function'
  );
  if (invalidProxyMethods.length > 0) {
    throw new TdlibAdapterError(
      `TDLib adapter proxy implementation methods must be functions: ${invalidProxyMethods.join(', ')}.`,
      'invalid_implementation',
      invalidProxyMethods
    );
  }
}

function requireSecureReference(input, sourceField, targetField, errors, request) {
  if (isSecureReference(input[targetField])) {
    request[targetField] = input[targetField];
    return;
  }

  const rawValueProvided = input[sourceField] !== undefined || input[targetField] !== undefined;
  const suffix = rawValueProvided ? ' Raw values are not accepted by the shared adapter boundary.' : '';
  errors.push(`${targetField} must be a secure reference such as env:NAME, keychain:name, or keystore:name.${suffix}`);
}

export function validateTdlibAuthenticationRequest(input = {}) {
  const errors = [];
  const request = {};

  requireSecureReference(input, 'apiId', 'apiIdRef', errors, request);
  if (input.api_id !== undefined) {
    errors.push('apiIdRef must be used instead of raw api_id values.');
  }

  requireSecureReference(input, 'apiHash', 'apiHashRef', errors, request);
  if (input.api_hash !== undefined) {
    errors.push('apiHashRef must be used instead of raw api_hash values.');
  }

  if (input.phoneNumber !== undefined || input.phoneNumberRef !== undefined) {
    requireSecureReference(input, 'phoneNumber', 'phoneNumberRef', errors, request);
  }

  if (input.botToken !== undefined || input.botTokenRef !== undefined) {
    requireSecureReference(input, 'botToken', 'botTokenRef', errors, request);
  }

  return {
    valid: errors.length === 0,
    errors,
    request
  };
}

export function validateTdlibChatListQuery(input = {}) {
  const errors = [];
  const limit = input.limit === undefined ? 50 : input.limit;
  const cursor = input.cursor ?? null;

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CHAT_LIST_LIMIT) {
    errors.push(`Chat list limit must be an integer between 1 and ${MAX_CHAT_LIST_LIMIT}.`);
  }

  if (cursor !== null && (typeof cursor !== 'object' || Array.isArray(cursor))) {
    errors.push('Chat list cursor must be null or an adapter-provided cursor object.');
  }

  return {
    valid: errors.length === 0,
    errors,
    query: {
      limit,
      cursor
    }
  };
}

export function validateTdlibMessageDraft(input = {}) {
  const errors = [];
  const chatId = input.chatId === undefined || input.chatId === null ? '' : String(input.chatId).trim();
  const text = typeof input.text === 'string' ? input.text : '';

  if (!chatId) {
    errors.push('Message chatId is required.');
  }

  if (text.trim().length === 0) {
    errors.push('Message text is required.');
  }

  if (text.length > MAX_MESSAGE_TEXT_LENGTH) {
    errors.push(`Message text must be ${MAX_MESSAGE_TEXT_LENGTH} characters or fewer.`);
  }

  const draft = {
    chatId,
    text
  };

  if (input.replyToMessageId !== undefined) {
    draft.replyToMessageId = String(input.replyToMessageId);
  }

  return {
    valid: errors.length === 0,
    errors,
    draft
  };
}

export function validateTdlibProxyConfig(input = {}) {
  const errors = [];
  const protocol = String(input.protocol ?? '').trim().toLowerCase();
  const host = String(input.host ?? '').trim();
  const port = input.port;
  const proxy = {
    protocol,
    host,
    port
  };

  if (!['mtproto', 'socks5'].includes(protocol)) {
    errors.push(`Unsupported proxy protocol: ${input.protocol}`);
  }

  if (!host) {
    errors.push('Proxy host is required.');
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push('Proxy port must be an integer between 1 and 65535.');
  }

  if (protocol === 'mtproto') {
    const secretRef = input.secretRef ?? input.secret;
    if (!isSecureReference(secretRef)) {
      errors.push('MTProto secretRef must be a secure reference such as env:TELETON_MTPROTO_SECRET.');
    } else {
      proxy.secretRef = secretRef;
    }
  }

  if (protocol === 'socks5') {
    for (const field of ['username', 'password']) {
      const refField = `${field}Ref`;
      const value = input[refField] ?? input[field];
      if (value === undefined) {
        continue;
      }

      if (!isSecureReference(value)) {
        errors.push(`SOCKS5 ${refField} must be a secure reference when provided.`);
      } else {
        proxy[refField] = value;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    proxy
  };
}

function validateProxyId(proxyId) {
  const errors = [];
  if (!Number.isInteger(proxyId) || proxyId < 1) {
    errors.push('TDLib proxy id must be a positive integer.');
  }

  return {
    valid: errors.length === 0,
    errors,
    proxyId
  };
}

function proxyTypeFor(proxy) {
  if (proxy.protocol === 'mtproto') {
    return {
      '@type': 'proxyTypeMtproto',
      secretRef: proxy.secretRef
    };
  }

  const type = {
    '@type': 'proxyTypeSocks5'
  };

  if (proxy.usernameRef !== undefined) {
    type.usernameRef = proxy.usernameRef;
  }

  if (proxy.passwordRef !== undefined) {
    type.passwordRef = proxy.passwordRef;
  }

  return type;
}

export function createTdlibAddProxyCommand(proxy) {
  return {
    '@type': 'addProxy',
    server: proxy.host,
    port: proxy.port,
    enable: true,
    type: proxyTypeFor(proxy)
  };
}

export function createTdlibEditProxyCommand(proxyId, proxy) {
  return {
    '@type': 'editProxy',
    proxy_id: proxyId,
    server: proxy.host,
    port: proxy.port,
    enable: true,
    type: proxyTypeFor(proxy)
  };
}

export function createTdlibDisableProxyCommand() {
  return {
    '@type': 'disableProxy'
  };
}

export function createTdlibRemoveProxyCommand(proxyId) {
  return {
    '@type': 'removeProxy',
    proxy_id: proxyId
  };
}

function validateUpdateSubscription(listener, input = {}) {
  const errors = [];

  if (typeof listener !== 'function') {
    errors.push('TDLib update listener must be a function.');
  }

  let types = null;
  if (input.types !== undefined) {
    if (!Array.isArray(input.types)) {
      errors.push('TDLib update subscription types must be an array.');
    } else {
      types = [...new Set(input.types.map((type) => String(type)))];
      for (const type of types) {
        if (!TDLIB_UPDATE_TYPES.includes(type)) {
          errors.push(`Unsupported TDLib update type: ${type}.`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    subscription: {
      types
    }
  };
}

export function createTdlibClientAdapter(implementation, options = {}) {
  assertBridgeImplementation(implementation);

  const platform = normalizePlatform(options.platform ?? implementation.platform ?? 'desktop');
  const logger = options.logger ?? implementation.logger;

  async function runNetworkOperation(operation, context, callback) {
    try {
      return await callback();
    } catch (error) {
      logNetworkError(logger, error, { operation, platform, ...context });
      throw error;
    }
  }

  return Object.freeze({
    platform,
    async authenticate(input = {}) {
      const validation = validateTdlibAuthenticationRequest(input);
      if (!validation.valid) {
        throw adapterError(validation.errors, 'invalid_authentication_request');
      }

      return runNetworkOperation('authenticate', validation.request, () => implementation.authenticate(validation.request));
    },
    async getChatList(input = {}) {
      const validation = validateTdlibChatListQuery(input);
      if (!validation.valid) {
        throw adapterError(validation.errors, 'invalid_chat_list_query');
      }

      return runNetworkOperation('getChatList', validation.query, () => implementation.getChatList(validation.query));
    },
    async sendMessage(input = {}) {
      const validation = validateTdlibMessageDraft(input);
      if (!validation.valid) {
        throw adapterError(validation.errors, 'invalid_message_draft');
      }

      return runNetworkOperation('sendMessage', validation.draft, () => implementation.sendMessage(validation.draft));
    },
    subscribeUpdates(listener, input = {}) {
      const validation = validateUpdateSubscription(listener, input);
      if (!validation.valid) {
        throw adapterError(validation.errors, 'invalid_update_subscription');
      }

      const unsubscribe = implementation.subscribeUpdates(listener, validation.subscription);
      if (typeof unsubscribe !== 'function') {
        throw new TdlibAdapterError('TDLib update subscriptions must return an unsubscribe function.', 'invalid_unsubscribe');
      }

      return unsubscribe;
    },
    async enableProxy(input = {}) {
      const validation = validateTdlibProxyConfig(input);
      if (!validation.valid) {
        throw adapterError(validation.errors, 'invalid_proxy_config');
      }

      const command = createTdlibAddProxyCommand(validation.proxy);
      if (typeof implementation.enableProxy !== 'function') {
        return command;
      }

      return runNetworkOperation(
        'enableProxy',
        { route: { type: validation.proxy.protocol, host: validation.proxy.host, port: validation.proxy.port } },
        () => implementation.enableProxy(command)
      );
    },
    async updateProxy(proxyId, input = {}) {
      const idValidation = validateProxyId(proxyId);
      const proxyValidation = validateTdlibProxyConfig(input);
      const errors = [...idValidation.errors, ...proxyValidation.errors];
      if (errors.length > 0) {
        throw adapterError(errors, 'invalid_proxy_config');
      }

      const command = createTdlibEditProxyCommand(idValidation.proxyId, proxyValidation.proxy);
      if (typeof implementation.updateProxy !== 'function') {
        return command;
      }

      return runNetworkOperation(
        'updateProxy',
        {
          proxyId: idValidation.proxyId,
          route: { type: proxyValidation.proxy.protocol, host: proxyValidation.proxy.host, port: proxyValidation.proxy.port }
        },
        () => implementation.updateProxy(idValidation.proxyId, command)
      );
    },
    async disableProxy() {
      const command = createTdlibDisableProxyCommand();
      if (typeof implementation.disableProxy !== 'function') {
        return command;
      }

      return runNetworkOperation('disableProxy', {}, () => implementation.disableProxy(command));
    },
    async removeProxy(proxyId) {
      const validation = validateProxyId(proxyId);
      if (!validation.valid) {
        throw adapterError(validation.errors, 'invalid_proxy_id');
      }

      const command = createTdlibRemoveProxyCommand(validation.proxyId);
      if (typeof implementation.removeProxy !== 'function') {
        return command;
      }

      return runNetworkOperation('removeProxy', { proxyId: validation.proxyId }, () =>
        implementation.removeProxy(validation.proxyId, command)
      );
    }
  });
}

function cloneCommand(command) {
  return structuredClone(command);
}

function cloneChat(chat) {
  return structuredClone(chat);
}

function shouldDeliverUpdate(subscription, update) {
  return subscription.types === null || subscription.types.includes(update.type);
}

export function createMockTdlibClientAdapter(seed = {}) {
  const platform = normalizePlatform(seed.platform ?? 'desktop');
  const chats = Array.isArray(seed.chats) ? seed.chats.map(cloneChat) : [];
  const commands = [];
  const subscribers = new Set();
  let nextMessageId = 1;
  let nextProxyId = 1;

  function publish(update) {
    for (const subscription of subscribers) {
      if (shouldDeliverUpdate(subscription, update)) {
        subscription.listener(update);
      }
    }
  }

  const implementation = {
    platform,
    async authenticate(request) {
      commands.push({ method: 'authenticate', request: structuredClone(request) });
      const session = {
        authorizationState: 'ready',
        userId: seed.userId ?? 'mock-user'
      };
      publish({ type: 'authorizationState', authorizationState: session.authorizationState, session });
      return session;
    },
    async getChatList(query) {
      commands.push({ method: 'getChatList', query: structuredClone(query) });
      const offset = Number.isInteger(query.cursor?.offset) ? query.cursor.offset : 0;
      const selectedChats = chats.slice(offset, offset + query.limit).map(cloneChat);
      const nextOffset = offset + selectedChats.length;

      return {
        chats: selectedChats,
        nextCursor: nextOffset < chats.length ? { offset: nextOffset } : null
      };
    },
    async sendMessage(draft) {
      commands.push({ method: 'sendMessage', draft: structuredClone(draft) });
      const message = {
        id: `mock-message-${nextMessageId}`,
        chatId: draft.chatId,
        text: draft.text,
        status: 'sent'
      };
      nextMessageId += 1;

      publish({ type: 'message', message });
      return message;
    },
    subscribeUpdates(listener, subscription) {
      commands.push({ method: 'subscribeUpdates', subscription: structuredClone(subscription) });
      const subscriber = {
        listener,
        types: subscription.types
      };
      subscribers.add(subscriber);

      return () => {
        subscribers.delete(subscriber);
      };
    },
    async enableProxy(command) {
      commands.push({ method: 'enableProxy', command: structuredClone(command) });
      const proxyId = nextProxyId;
      nextProxyId += 1;

      return { proxyId };
    },
    async updateProxy(proxyId, command) {
      commands.push({ method: 'updateProxy', proxyId, command: structuredClone(command) });
      return { proxyId };
    },
    async disableProxy(command) {
      commands.push({ method: 'disableProxy', command: structuredClone(command) });
      return { disabled: true };
    },
    async removeProxy(proxyId, command) {
      commands.push({ method: 'removeProxy', proxyId, command: structuredClone(command) });
      return { proxyId, removed: true };
    }
  };

  const adapter = createTdlibClientAdapter(implementation, { platform });

  return Object.freeze({
    ...adapter,
    emitUpdate(update) {
      publish(update);
    },
    getCommands() {
      return commands.map(cloneCommand);
    }
  });
}
