import type { ProxySettings } from '../shared/types';

export interface ProxyValidationResult {
  valid: boolean;
  errors: string[];
  normalized?: ProxySettings;
}

const DEFAULT_PROXY: ProxySettings = {
  enabled: false,
  type: 'none',
  host: '',
  port: 0
};

function normalizeHost(value: string) {
  return value.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function isValidHost(value: string) {
  if (!value) return false;
  if (value.includes('/') || value.includes('@')) return false;
  return /^[A-Za-z0-9.-]+$/.test(value) || /^\[[0-9A-Fa-f:.]+\]$/.test(value);
}

function isValidPort(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

function isSafeSecretRef(value?: string) {
  if (!value) return false;
  return /^(env|keychain|keystore|secret):[A-Za-z0-9_.:/-]+$/.test(value);
}

export function defaultProxySettings(): ProxySettings {
  return { ...DEFAULT_PROXY };
}

export function validateProxySettings(input: ProxySettings): ProxyValidationResult {
  const normalized: ProxySettings = {
    enabled: Boolean(input.enabled),
    type: input.enabled ? input.type : 'none',
    host: normalizeHost(input.host ?? ''),
    port: Number(input.port ?? 0),
    username: input.username?.trim() || undefined,
    password: input.password || undefined,
    secret: input.secret?.trim() || undefined
  };
  const errors: string[] = [];

  if (!normalized.enabled || normalized.type === 'none') {
    return {
      valid: true,
      errors: [],
      normalized: { ...DEFAULT_PROXY }
    };
  }

  if (!['socks5', 'mtproto'].includes(normalized.type)) {
    errors.push('Select SOCKS5 or MTProto.');
  }

  if (!isValidHost(normalized.host)) {
    errors.push('Enter a proxy host without a scheme or path.');
  }

  if (!isValidPort(normalized.port)) {
    errors.push('Use a proxy port from 1 to 65535.');
  }

  if (normalized.type === 'mtproto' && !isSafeSecretRef(normalized.secret)) {
    errors.push('Use a secure reference for the MTProto secret.');
  }

  if (normalized.type === 'socks5' && normalized.password && !normalized.username) {
    errors.push('Set a SOCKS5 username when a password is provided.');
  }

  return {
    valid: errors.length === 0,
    errors,
    normalized
  };
}

export function serializeProxyForDiagnostics(proxy: ProxySettings) {
  return {
    enabled: proxy.enabled,
    type: proxy.type,
    host: proxy.host,
    port: proxy.port,
    hasUsername: Boolean(proxy.username),
    hasPassword: Boolean(proxy.password),
    hasSecret: Boolean(proxy.secret)
  };
}
