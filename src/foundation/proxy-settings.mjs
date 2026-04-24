export const PROXY_PROTOCOLS = Object.freeze(['mtproto', 'socks5']);

const SECURE_REFERENCE_PATTERN = /^(env|keychain|keystore|secret):[A-Za-z0-9_.:/-]+$/;

export function isSecureReference(value) {
  return typeof value === 'string' && SECURE_REFERENCE_PATTERN.test(value);
}

export function validateProxyConfig(config = {}) {
  const errors = [];
  const normalized = {
    protocol: String(config.protocol ?? '').toLowerCase(),
    host: String(config.host ?? '').trim(),
    port: config.port
  };

  if (!PROXY_PROTOCOLS.includes(normalized.protocol)) {
    errors.push(`Unsupported proxy protocol: ${config.protocol}`);
  }

  if (!normalized.host) {
    errors.push('Proxy host is required.');
  }

  if (!Number.isInteger(normalized.port) || normalized.port < 1 || normalized.port > 65535) {
    errors.push('Proxy port must be an integer between 1 and 65535.');
  }

  if (normalized.protocol === 'mtproto') {
    if (!isSecureReference(config.secret)) {
      errors.push('MTProto secret must be a secure reference such as env:TELETON_MTPROTO_SECRET.');
    }
  }

  if (normalized.protocol === 'socks5') {
    for (const field of ['username', 'password']) {
      if (config[field] !== undefined && !isSecureReference(config[field])) {
        errors.push(`SOCKS5 ${field} must be stored as a secure reference when provided.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    config: {
      protocol: normalized.protocol,
      host: normalized.host,
      port: normalized.port,
      secretRef: config.secret,
      usernameRef: config.username,
      passwordRef: config.password
    }
  };
}
