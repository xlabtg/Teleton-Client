import { createAgentSettings, validateAgentSettings } from './agent-settings.mjs';
import { isSecureReference, validateProxyConfig } from './proxy-settings.mjs';

export const SETTINGS_SCHEMA_VERSION = 1;
export const SETTINGS_PLATFORM_WRAPPERS = Object.freeze(['android', 'ios', 'desktop', 'web']);
export const SETTINGS_THEMES = Object.freeze(['system', 'light', 'dark']);

const LANGUAGE_TAG_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const CLOCK_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const SECRET_REF_NAME_PATTERN = /^[A-Za-z0-9_.:-]+$/;

export const DEFAULT_TELETON_SETTINGS = deepFreeze({
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  language: 'system',
  theme: 'system',
  proxy: {
    enabled: false,
    activeProxyId: null,
    entries: []
  },
  notifications: {
    enabled: true,
    messagePreviews: true,
    sounds: true,
    mentionsOnly: false,
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '07:00',
      timezone: 'local'
    }
  },
  agent: {
    mode: 'off',
    model: null,
    requireConfirmation: true,
    allowCloudProcessing: false,
    maxAutonomousActionsPerHour: 0
  },
  security: {
    requireDeviceLock: false,
    biometricUnlock: false,
    lockAfterMinutes: 0,
    redactSensitiveNotifications: true,
    secretRefs: {}
  }
});

export const TELETON_SETTINGS_SCHEMA = deepFreeze({
  id: 'teleton.settings.v1',
  version: SETTINGS_SCHEMA_VERSION,
  type: 'object',
  platforms: [...SETTINGS_PLATFORM_WRAPPERS],
  defaults: DEFAULT_TELETON_SETTINGS,
  required: ['schemaVersion', 'language', 'theme', 'proxy', 'notifications', 'agent', 'security']
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

function clone(value) {
  return structuredClone(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizePlatform(value) {
  const platform = String(value ?? '').trim().toLowerCase();

  if (!SETTINGS_PLATFORM_WRAPPERS.includes(platform)) {
    throw new Error(`Unsupported settings platform: ${value}`);
  }

  return platform;
}

function objectField(value, label, errors, fallback = {}) {
  if (value === undefined) {
    return fallback;
  }

  if (isPlainObject(value)) {
    return value;
  }

  errors.push(`${label} must be an object.`);
  return fallback;
}

function arrayField(value, label, errors, fallback = []) {
  if (value === undefined) {
    return fallback;
  }

  if (Array.isArray(value)) {
    return value;
  }

  errors.push(`${label} must be an array.`);
  return fallback;
}

function booleanError(value, label, errors) {
  if (typeof value !== 'boolean') {
    errors.push(`${label} must be true or false.`);
  }
}

function migrateToCurrentShape(input = {}) {
  if (!isPlainObject(input)) {
    throw new Error('Settings payload must be an object.');
  }

  const schemaVersion = input.schemaVersion ?? 0;
  if (!Number.isInteger(schemaVersion)) {
    throw new Error('Settings schemaVersion must be an integer.');
  }

  if (schemaVersion > SETTINGS_SCHEMA_VERSION) {
    throw new Error(
      `Settings schema version ${schemaVersion} is newer than this client supports (${SETTINGS_SCHEMA_VERSION}).`
    );
  }

  if (schemaVersion < 0) {
    throw new Error(`Unsupported settings schema version: ${schemaVersion}.`);
  }

  if (schemaVersion === SETTINGS_SCHEMA_VERSION) {
    return { ...input, schemaVersion: SETTINGS_SCHEMA_VERSION };
  }

  const migrated = {
    ...input,
    schemaVersion: SETTINGS_SCHEMA_VERSION
  };

  if (input.agentMode !== undefined) {
    migrated.agent = isPlainObject(input.agent) ? { ...input.agent } : {};
    if (migrated.agent.mode === undefined) {
      migrated.agent.mode = input.agentMode;
    }
  }

  if (input.notificationsEnabled !== undefined) {
    migrated.notifications = isPlainObject(input.notifications) ? { ...input.notifications } : {};
    if (migrated.notifications.enabled === undefined) {
      migrated.notifications.enabled = input.notificationsEnabled;
    }
  }

  delete migrated.agentMode;
  delete migrated.notificationsEnabled;

  return migrated;
}

function normalizeLanguage(value, errors) {
  const language = value ?? DEFAULT_TELETON_SETTINGS.language;

  if (language !== 'system' && (typeof language !== 'string' || !LANGUAGE_TAG_PATTERN.test(language))) {
    errors.push('Language must be "system" or a valid BCP 47-style tag such as en-US.');
  }

  return language;
}

function normalizeTheme(value, errors) {
  const theme = value ?? DEFAULT_TELETON_SETTINGS.theme;

  if (!SETTINGS_THEMES.includes(theme)) {
    errors.push(`Theme must be one of: ${SETTINGS_THEMES.join(', ')}.`);
  }

  return theme;
}

function normalizeAgent(value, errors) {
  const agentInput = objectField(value, 'Agent settings', errors, DEFAULT_TELETON_SETTINGS.agent);
  const validation = validateAgentSettings(agentInput);

  errors.push(...validation.errors);

  return validation.settings ?? createAgentSettings();
}

function normalizeProxyEntry(entry, index, errors) {
  if (!isPlainObject(entry)) {
    errors.push(`Proxy entry ${index + 1} must be an object.`);
    return null;
  }

  const normalized = {
    id: String(entry.id ?? '').trim(),
    protocol: entry.protocol,
    host: entry.host,
    port: entry.port
  };

  const secretRef = entry.secretRef ?? entry.secret;
  const usernameRef = entry.usernameRef ?? entry.username;
  const passwordRef = entry.passwordRef ?? entry.password;

  if (secretRef !== undefined) {
    normalized.secretRef = secretRef;
  }

  if (usernameRef !== undefined) {
    normalized.usernameRef = usernameRef;
  }

  if (passwordRef !== undefined) {
    normalized.passwordRef = passwordRef;
  }

  const label = normalized.id || String(index + 1);
  if (!normalized.id) {
    errors.push(`Proxy entry ${label} requires a stable id.`);
  }

  const proxyValidation = validateProxyConfig({
    protocol: normalized.protocol,
    host: normalized.host,
    port: normalized.port,
    secret: normalized.secretRef,
    username: normalized.usernameRef,
    password: normalized.passwordRef
  });

  for (const error of proxyValidation.errors) {
    errors.push(`Proxy entry ${label}: ${error}`);
  }

  return normalized;
}

function normalizeProxy(value, errors) {
  const proxyInput = objectField(value, 'Proxy settings', errors, DEFAULT_TELETON_SETTINGS.proxy);
  const entriesInput = arrayField(proxyInput.entries, 'Proxy entries', errors, DEFAULT_TELETON_SETTINGS.proxy.entries);
  const entries = [];
  const ids = new Set();

  for (const [index, entry] of entriesInput.entries()) {
    const normalized = normalizeProxyEntry(entry, index, errors);
    if (!normalized) {
      continue;
    }

    if (normalized.id && ids.has(normalized.id)) {
      errors.push(`Proxy entry ${normalized.id} uses a duplicate id.`);
    }

    ids.add(normalized.id);
    entries.push(normalized);
  }

  const enabled = proxyInput.enabled ?? DEFAULT_TELETON_SETTINGS.proxy.enabled;
  const activeProxyId = proxyInput.activeProxyId ?? DEFAULT_TELETON_SETTINGS.proxy.activeProxyId;

  booleanError(enabled, 'Proxy enabled', errors);

  if (activeProxyId !== null && (typeof activeProxyId !== 'string' || activeProxyId.trim().length === 0)) {
    errors.push('Active proxy id must be null or a non-empty string.');
  }

  if (enabled === true) {
    if (typeof activeProxyId !== 'string' || activeProxyId.trim().length === 0) {
      errors.push('Proxy enabled requires an activeProxyId.');
    } else if (!ids.has(activeProxyId)) {
      errors.push(`Proxy enabled references missing activeProxyId: ${activeProxyId}.`);
    }
  }

  return {
    enabled,
    activeProxyId,
    entries
  };
}

function normalizeQuietHours(value, errors) {
  const quietHoursInput = objectField(
    value,
    'Notification quietHours',
    errors,
    DEFAULT_TELETON_SETTINGS.notifications.quietHours
  );

  const quietHours = {
    enabled: quietHoursInput.enabled ?? DEFAULT_TELETON_SETTINGS.notifications.quietHours.enabled,
    start: quietHoursInput.start ?? DEFAULT_TELETON_SETTINGS.notifications.quietHours.start,
    end: quietHoursInput.end ?? DEFAULT_TELETON_SETTINGS.notifications.quietHours.end,
    timezone: quietHoursInput.timezone ?? DEFAULT_TELETON_SETTINGS.notifications.quietHours.timezone
  };

  booleanError(quietHours.enabled, 'Quiet hours enabled', errors);

  if (typeof quietHours.start !== 'string' || !CLOCK_TIME_PATTERN.test(quietHours.start)) {
    errors.push('Quiet hours start must use 24-hour HH:mm format.');
  }

  if (typeof quietHours.end !== 'string' || !CLOCK_TIME_PATTERN.test(quietHours.end)) {
    errors.push('Quiet hours end must use 24-hour HH:mm format.');
  }

  if (typeof quietHours.timezone !== 'string' || quietHours.timezone.trim().length === 0) {
    errors.push('Quiet hours timezone must be "local" or a platform timezone identifier.');
  }

  return quietHours;
}

function normalizeNotifications(value, errors) {
  const notificationInput = objectField(
    value,
    'Notification settings',
    errors,
    DEFAULT_TELETON_SETTINGS.notifications
  );
  const notifications = {
    enabled: notificationInput.enabled ?? DEFAULT_TELETON_SETTINGS.notifications.enabled,
    messagePreviews: notificationInput.messagePreviews ?? DEFAULT_TELETON_SETTINGS.notifications.messagePreviews,
    sounds: notificationInput.sounds ?? DEFAULT_TELETON_SETTINGS.notifications.sounds,
    mentionsOnly: notificationInput.mentionsOnly ?? DEFAULT_TELETON_SETTINGS.notifications.mentionsOnly,
    quietHours: normalizeQuietHours(notificationInput.quietHours, errors)
  };

  booleanError(notifications.enabled, 'Notifications enabled', errors);
  booleanError(notifications.messagePreviews, 'Notification messagePreviews', errors);
  booleanError(notifications.sounds, 'Notification sounds', errors);
  booleanError(notifications.mentionsOnly, 'Notification mentionsOnly', errors);

  return notifications;
}

function normalizeSecurity(value, errors) {
  const securityInput = objectField(value, 'Security settings', errors, DEFAULT_TELETON_SETTINGS.security);
  const secretRefsInput = objectField(
    securityInput.secretRefs,
    'Security secretRefs',
    errors,
    DEFAULT_TELETON_SETTINGS.security.secretRefs
  );
  const secretRefs = {};

  for (const [name, reference] of Object.entries(secretRefsInput)) {
    if (!SECRET_REF_NAME_PATTERN.test(name)) {
      errors.push(`Security secretRefs key "${name}" must contain only letters, numbers, dots, underscores, colons, or dashes.`);
    }

    if (!isSecureReference(reference)) {
      errors.push(`Security secretRefs.${name} must be a secure reference such as env:NAME, keychain:name, or keystore:name.`);
    }

    secretRefs[name] = reference;
  }

  const security = {
    requireDeviceLock: securityInput.requireDeviceLock ?? DEFAULT_TELETON_SETTINGS.security.requireDeviceLock,
    biometricUnlock: securityInput.biometricUnlock ?? DEFAULT_TELETON_SETTINGS.security.biometricUnlock,
    lockAfterMinutes: securityInput.lockAfterMinutes ?? DEFAULT_TELETON_SETTINGS.security.lockAfterMinutes,
    redactSensitiveNotifications:
      securityInput.redactSensitiveNotifications ?? DEFAULT_TELETON_SETTINGS.security.redactSensitiveNotifications,
    secretRefs
  };

  booleanError(security.requireDeviceLock, 'Security requireDeviceLock', errors);
  booleanError(security.biometricUnlock, 'Security biometricUnlock', errors);
  booleanError(security.redactSensitiveNotifications, 'Security redactSensitiveNotifications', errors);

  if (!Number.isInteger(security.lockAfterMinutes) || security.lockAfterMinutes < 0 || security.lockAfterMinutes > 1440) {
    errors.push('Security lockAfterMinutes must be an integer between 0 and 1440.');
  }

  if (security.biometricUnlock === true && security.requireDeviceLock !== true) {
    errors.push('Biometric unlock requires device lock to be enabled.');
  }

  return security;
}

function normalizeAndValidate(input = {}) {
  const errors = [];
  let shape;

  try {
    shape = migrateToCurrentShape(input);
  } catch (error) {
    return {
      valid: false,
      errors: [error.message],
      settings: undefined
    };
  }

  const settings = {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    language: normalizeLanguage(shape.language, errors),
    theme: normalizeTheme(shape.theme, errors),
    proxy: normalizeProxy(shape.proxy, errors),
    notifications: normalizeNotifications(shape.notifications, errors),
    agent: normalizeAgent(shape.agent, errors),
    security: normalizeSecurity(shape.security, errors)
  };

  if (shape.platform !== undefined) {
    try {
      settings.platform = normalizePlatform(shape.platform);
    } catch (error) {
      errors.push(error.message);
      settings.platform = shape.platform;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    settings
  };
}

export function createTeletonSettings(input = {}) {
  const result = normalizeAndValidate(input);

  if (!result.valid) {
    throw new Error(result.errors.join(' '));
  }

  return result.settings;
}

export function validateTeletonSettings(input = {}) {
  return normalizeAndValidate(input);
}

export function migrateTeletonSettings(input = {}) {
  return createTeletonSettings(input);
}

export function createPlatformSettings(platform, input = {}) {
  return createTeletonSettings({
    ...input,
    platform: normalizePlatform(platform)
  });
}

export function serializeTeletonSettings(input = {}) {
  return JSON.stringify(createTeletonSettings(input));
}

export function createDefaultSettings() {
  return clone(DEFAULT_TELETON_SETTINGS);
}
