export const NETWORK_ERROR_CATEGORIES = Object.freeze([
  'direct_connection_failed',
  'mtproto_proxy_failed',
  'socks5_proxy_failed',
  'http_connect_proxy_failed',
  'proxy_configuration_failed',
  'network_operation_failed'
]);

const SECRET_FIELD_PATTERN = /(?:secret|password|token|hash|phone|message|text|content|apiid|apikey)/i;
const SECURE_REFERENCE_PATTERN = /\b(?:env|keychain|keystore|secret):[A-Za-z0-9_.:/-]+\b/g;
const PHONE_PATTERN = /\+?\d[\d\s().-]{7,}\d/g;
const TOKEN_PATTERN = /\b\d{5,}:[A-Za-z0-9_-]{20,}\b/g;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function redactString(value) {
  return value
    .replace(SECURE_REFERENCE_PATTERN, '[REDACTED]')
    .replace(TOKEN_PATTERN, '[REDACTED]')
    .replace(PHONE_PATTERN, '[REDACTED]');
}

export function redactNetworkLogValue(value, key = '') {
  if (value === null || value === undefined) {
    return value;
  }

  if (SECRET_FIELD_PATTERN.test(key)) {
    return '[REDACTED]';
  }

  if (typeof value === 'string') {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactNetworkLogValue(entry));
  }

  if (isPlainObject(value)) {
    const redacted = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      redacted[entryKey] = redactNetworkLogValue(entryValue, entryKey);
    }
    return redacted;
  }

  return value;
}

export function classifyNetworkError(context = {}) {
  const protocol = String(context.protocol ?? context.route?.type ?? '').toLowerCase();
  const operation = String(context.operation ?? '').toLowerCase();

  if (operation.includes('proxy') && operation.includes('config')) {
    return 'proxy_configuration_failed';
  }

  if (protocol === 'mtproto') {
    return 'mtproto_proxy_failed';
  }

  if (protocol === 'socks5') {
    return 'socks5_proxy_failed';
  }

  if (protocol === 'http-connect') {
    return 'http_connect_proxy_failed';
  }

  if (protocol === 'direct' || operation.includes('direct')) {
    return 'direct_connection_failed';
  }

  return 'network_operation_failed';
}

export function createNetworkErrorLogEntry(error, context = {}) {
  const category = classifyNetworkError(context);
  const err = error instanceof Error ? error : new Error(String(error ?? 'Unknown network error'));

  return Object.freeze({
    level: 'error',
    event: 'network.error',
    category,
    operation: context.operation ?? 'network',
    routeType: context.route?.type ?? context.protocol ?? null,
    proxyId: context.route?.proxyId ?? context.proxyId ?? null,
    host: context.route?.host ?? context.host ?? null,
    port: context.route?.port ?? context.port ?? null,
    error: redactNetworkLogValue({
      name: err.name,
      message: err.message,
      code: err.code
    }),
    context: redactNetworkLogValue(context)
  });
}

export function logNetworkError(logger, error, context = {}) {
  const entry = createNetworkErrorLogEntry(error, context);

  try {
    if (typeof logger === 'function') {
      logger(entry);
      return entry;
    }

    if (logger && typeof logger.error === 'function') {
      logger.error(entry);
    }
  } catch {
    return entry;
  }

  return entry;
}
