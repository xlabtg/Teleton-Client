export const TOKEN_REFRESH_INTEGRATIONS = Object.freeze(['telegram', 'agent-provider', 'settings-sync', 'ton']);
export const TOKEN_REFRESH_STATES = Object.freeze([
  'valid',
  'refresh_due',
  'refresh_failed',
  'reauthentication_required',
  'invalid'
]);

export const TOKEN_REFRESH_INTEGRATION_CATALOG = deepFreeze([
  {
    integration: 'telegram',
    credentialFields: ['apiIdRef', 'apiHashRef', 'phoneNumberRef', 'botTokenRef', 'sessionRef'],
    refreshCredentialFields: ['refreshTokenRef', 'botTokenRefreshRef', 'sessionRefreshRef'],
    reauthenticationAction: 'telegram.reauthenticate'
  },
  {
    integration: 'agent-provider',
    credentialFields: ['apiKeyRef', 'tokenRef'],
    refreshCredentialFields: ['refreshTokenRef'],
    reauthenticationAction: 'agent.provider.reauthenticate'
  },
  {
    integration: 'settings-sync',
    credentialFields: ['encryptionKeyRef', 'transportTokenRef'],
    refreshCredentialFields: ['refreshTokenRef', 'rotationKeyRef'],
    reauthenticationAction: 'settings.sync.reauthenticate'
  },
  {
    integration: 'ton',
    credentialFields: ['walletProviderRef', 'secureStorageRef'],
    refreshCredentialFields: ['refreshTokenRef', 'walletProviderRefreshRef'],
    reauthenticationAction: 'ton.wallet.reauthenticate'
  }
]);

const DEFAULT_REFRESH_BEFORE_MS = 5 * 60 * 1000;
const DEFAULT_INITIAL_BACKOFF_MS = 30 * 1000;
const DEFAULT_MAX_BACKOFF_MS = 60 * 60 * 1000;
const REFERENCE_PATTERN = /^(?:env|keychain|keystore|secret|wallet):[A-Za-z0-9_.:/-]+$/;
const REFERENCE_PATTERN_GLOBAL = /\b(?:env|keychain|keystore|secret|wallet):[A-Za-z0-9_.:/-]+\b/g;
const BOT_TOKEN_PATTERN_GLOBAL = /\b\d{5,}:[A-Za-z0-9_-]{20,}\b/g;
const OPENAI_API_KEY_PATTERN_GLOBAL = /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g;
const GITHUB_TOKEN_PATTERN_GLOBAL = /\bgh(?:p|o|u|s|r)_[A-Za-z0-9_]{36,255}\b/g;
const PRIVATE_KEY_PATTERN_GLOBAL = /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/g;
const RAW_CREDENTIAL_FIELDS = Object.freeze([
  'accessToken',
  'refreshToken',
  'apiKey',
  'token',
  'secret',
  'password',
  'privateKey',
  'private_key',
  'mnemonic',
  'seedPhrase',
  'seed_phrase',
  'apiHash',
  'apiId',
  'botToken'
]);

export class TokenRefreshError extends Error {
  constructor(message, code, details = []) {
    super(message);
    this.name = 'TokenRefreshError';
    this.code = code;
    this.details = details;
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function catalogFor(integration) {
  return TOKEN_REFRESH_INTEGRATION_CATALOG.find((entry) => entry.integration === integration) ?? null;
}

export function isTokenRefreshReference(value) {
  return typeof value === 'string' && REFERENCE_PATTERN.test(value.trim());
}

function sanitizeTokenRefreshMessage(value) {
  return String(value ?? 'Unknown token refresh error.')
    .replace(PRIVATE_KEY_PATTERN_GLOBAL, '[REDACTED]')
    .replace(BOT_TOKEN_PATTERN_GLOBAL, '[REDACTED]')
    .replace(OPENAI_API_KEY_PATTERN_GLOBAL, '[REDACTED]')
    .replace(GITHUB_TOKEN_PATTERN_GLOBAL, '[REDACTED]')
    .replace(REFERENCE_PATTERN_GLOBAL, '[REDACTED]');
}

function normalizeNow(value) {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());

  if (Number.isNaN(date.getTime())) {
    throw new TokenRefreshError('Token refresh now must be a valid ISO timestamp.', 'invalid_now');
  }

  return {
    iso: date.toISOString(),
    ms: date.getTime()
  };
}

function normalizeOptionalTimestamp(value, label, errors) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    errors.push(`${label} must be a valid ISO timestamp.`);
    return String(value);
  }

  return date.toISOString();
}

function normalizePolicy(options = {}) {
  const refreshBeforeMs = options.refreshBeforeMs ?? DEFAULT_REFRESH_BEFORE_MS;
  const initialBackoffMs = options.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS;
  const maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;

  for (const [label, value] of [
    ['refreshBeforeMs', refreshBeforeMs],
    ['initialBackoffMs', initialBackoffMs],
    ['maxBackoffMs', maxBackoffMs]
  ]) {
    if (!Number.isInteger(value) || value < 0) {
      throw new TokenRefreshError(`Token refresh ${label} must be a non-negative integer.`, 'invalid_policy');
    }
  }

  return {
    refreshBeforeMs,
    initialBackoffMs,
    maxBackoffMs
  };
}

function collectRawCredentialErrors(input, errors) {
  for (const field of RAW_CREDENTIAL_FIELDS) {
    if (input[field] !== undefined) {
      errors.push(`${field} must not be provided to token refresh; use a secure reference field instead.`);
    }
  }
}

function normalizeReference(value, label, errors) {
  const reference = String(value ?? '').trim();

  if (!isTokenRefreshReference(reference)) {
    errors.push(`${label} must be a secure reference such as env:NAME, keychain:name, keystore:name, secret:name, or wallet:name.`);
  }

  return reference;
}

function selectCredentialReference(input, catalog, errors) {
  const supplied = [];

  if (input.credentialRef !== undefined) {
    supplied.push(['credentialRef', input.credentialRef]);
  }

  for (const field of catalog.credentialFields) {
    if (input[field] !== undefined) {
      supplied.push([field, input[field]]);
    }
  }

  if (supplied.length === 0) {
    errors.push(`Token refresh ${catalog.integration} records require one credential reference field.`);
    return {
      credentialField: String(input.credentialField ?? ''),
      credentialRef: ''
    };
  }

  if (supplied.length > 1) {
    errors.push('Token refresh records must include exactly one credential reference field.');
  }

  const [fallbackField, value] = supplied[0];
  const credentialField = String(input.credentialField ?? fallbackField).trim();

  if (credentialField !== fallbackField && fallbackField !== 'credentialRef') {
    errors.push(`Token refresh credentialField must match the supplied ${fallbackField} field.`);
  }

  if (fallbackField === 'credentialRef' && credentialField && !catalog.credentialFields.includes(credentialField)) {
    errors.push(
      `Token refresh credentialField for ${catalog.integration} must be one of: ${catalog.credentialFields.join(', ')}.`
    );
  }

  return {
    credentialField: credentialField || fallbackField,
    credentialRef: normalizeReference(value, `${credentialField || fallbackField}`, errors)
  };
}

function normalizeRefreshTokenRef(input, catalog, errors) {
  const supplied = [];

  if (input.refreshTokenRef !== undefined) {
    supplied.push(['refreshTokenRef', input.refreshTokenRef]);
  }

  for (const field of catalog.refreshCredentialFields) {
    if (field !== 'refreshTokenRef' && input[field] !== undefined) {
      supplied.push([field, input[field]]);
    }
  }

  if (supplied.length === 0) {
    return null;
  }

  if (supplied.length > 1) {
    errors.push('Token refresh records must include only one refresh credential reference field.');
  }

  const [field, value] = supplied[0];
  return normalizeReference(value, field, errors);
}

function normalizeFailure(input = {}) {
  if (!isPlainObject(input)) {
    return null;
  }

  const attempt = Number(input.attempt ?? 0);

  return {
    attempt: Number.isInteger(attempt) && attempt > 0 ? attempt : 0,
    category: typeof input.category === 'string' ? input.category : null,
    occurredAt: input.occurredAt ?? null
  };
}

export function validateTokenRefreshRecord(input = {}) {
  const errors = [];

  if (!isPlainObject(input)) {
    return {
      valid: false,
      errors: ['Token refresh record must be an object.'],
      record: null
    };
  }

  collectRawCredentialErrors(input, errors);

  const id = String(input.id ?? '').trim();
  if (!id) {
    errors.push('Token refresh record id is required.');
  }

  const integration = String(input.integration ?? '').trim();
  const catalog = catalogFor(integration);
  if (!catalog) {
    errors.push(`Token refresh integration must be one of: ${TOKEN_REFRESH_INTEGRATIONS.join(', ')}.`);
  }

  const credential = catalog
    ? selectCredentialReference(input, catalog, errors)
    : {
        credentialField: String(input.credentialField ?? ''),
        credentialRef: ''
      };
  const refreshTokenRef = catalog ? normalizeRefreshTokenRef(input, catalog, errors) : null;
  const expiresAt = normalizeOptionalTimestamp(input.expiresAt, 'Token refresh expiresAt', errors);
  const issuedAt = normalizeOptionalTimestamp(input.issuedAt, 'Token refresh issuedAt', errors);
  const nextAttemptAt = normalizeOptionalTimestamp(input.nextAttemptAt, 'Token refresh nextAttemptAt', errors);
  const status = String(input.status ?? input.state ?? '').trim().toLowerCase();
  const revoked = input.revoked === true || status === 'revoked' || status === 'invalid';
  const refreshable = input.refreshable === false ? false : refreshTokenRef !== null;

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      record: null
    };
  }

  return {
    valid: true,
    errors,
    record: {
      id,
      integration,
      credentialField: credential.credentialField,
      credentialRef: credential.credentialRef,
      refreshTokenRef,
      expiresAt,
      issuedAt,
      nextAttemptAt,
      revoked,
      refreshable,
      failure: normalizeFailure(input.failure),
      reauthenticationAction: input.reauthenticationAction ?? catalog.reauthenticationAction
    }
  };
}

function reauthenticationState(record, reason, message = null) {
  return {
    id: record.id,
    integration: record.integration,
    credentialField: record.credentialField,
    expiresAt: record.expiresAt,
    refreshable: record.refreshable,
    state: 'reauthentication_required',
    dueReason: reason,
    nextRefreshAt: null,
    nextAttemptAt: null,
    reauthentication: {
      required: true,
      reason,
      action: record.reauthenticationAction,
      message: message === null ? null : sanitizeTokenRefreshMessage(message)
    }
  };
}

function validState(record, nextRefreshAt) {
  return {
    id: record.id,
    integration: record.integration,
    credentialField: record.credentialField,
    expiresAt: record.expiresAt,
    refreshable: record.refreshable,
    state: 'valid',
    dueReason: null,
    nextRefreshAt,
    nextAttemptAt: null,
    reauthentication: {
      required: false
    }
  };
}

function dueState(record, dueReason, nowIso) {
  return {
    id: record.id,
    integration: record.integration,
    credentialField: record.credentialField,
    expiresAt: record.expiresAt,
    refreshable: record.refreshable,
    state: 'refresh_due',
    dueReason,
    nextRefreshAt: nowIso,
    nextAttemptAt: null,
    reauthentication: {
      required: false
    }
  };
}

function invalidState(errors, input) {
  return {
    id: typeof input?.id === 'string' ? input.id : null,
    integration: typeof input?.integration === 'string' ? input.integration : null,
    state: 'invalid',
    errors,
    reauthentication: {
      required: false
    }
  };
}

function assessValidatedRecord(record, options = {}) {
  const now = normalizeNow(options.now);
  const policy = normalizePolicy(options);

  if (record.revoked) {
    return reauthenticationState(record, 'revoked');
  }

  if (record.nextAttemptAt && Date.parse(record.nextAttemptAt) > now.ms) {
    return {
      id: record.id,
      integration: record.integration,
      credentialField: record.credentialField,
      expiresAt: record.expiresAt,
      refreshable: record.refreshable,
      state: 'refresh_failed',
      dueReason: 'retry_scheduled',
      nextRefreshAt: null,
      nextAttemptAt: record.nextAttemptAt,
      failure: record.failure,
      reauthentication: {
        required: false
      }
    };
  }

  if (!record.expiresAt) {
    return validState(record, null);
  }

  const expiresAtMs = Date.parse(record.expiresAt);
  if (expiresAtMs <= now.ms) {
    return record.refreshable ? dueState(record, 'expired', now.iso) : reauthenticationState(record, 'expired');
  }

  const refreshAtMs = Math.max(expiresAtMs - policy.refreshBeforeMs, now.ms);
  if (refreshAtMs <= now.ms) {
    return record.refreshable ? dueState(record, 'expiring_soon', now.iso) : validState(record, null);
  }

  return validState(record, new Date(refreshAtMs).toISOString());
}

function assessTokenRefreshRecord(input, options = {}) {
  const validation = validateTokenRefreshRecord(input);
  if (!validation.valid) {
    return {
      item: invalidState(validation.errors, input),
      record: null,
      errors: validation.errors
    };
  }

  return {
    item: assessValidatedRecord(validation.record, options),
    record: validation.record,
    errors: []
  };
}

export function createTokenRefreshPlan(records = [], options = {}) {
  if (!Array.isArray(records)) {
    throw new TokenRefreshError('Token refresh plan records must be an array.', 'invalid_plan_records');
  }

  const now = normalizeNow(options.now);
  const items = records.map((record) => assessTokenRefreshRecord(record, { ...options, now: now.iso }).item);

  return {
    generatedAt: now.iso,
    items,
    due: items.filter((item) => item.state === 'refresh_due'),
    reauthenticationRequired: items.filter((item) => item.state === 'reauthentication_required'),
    retryableFailures: items.filter((item) => item.state === 'refresh_failed')
  };
}

function assertRefreshBridge(bridge) {
  if (!bridge || typeof bridge.refreshToken !== 'function') {
    throw new TokenRefreshError('Token refresh controller requires a bridge with a refreshToken hook.', 'invalid_bridge');
  }
}

function classifyRefreshError(error) {
  const code = String(error?.code ?? '').toLowerCase();
  const message = String(error?.message ?? error ?? '').toLowerCase();
  const combined = `${code} ${message}`;

  if (/invalid[_-]?grant|revoked|invalid[_ -]?token|unauthorized|forbidden|\b401\b|\b403\b/.test(combined)) {
    return 'revoked';
  }

  if (/network|timeout|fetch|econn|enotfound|eai_again|socket|offline|temporar/.test(combined)) {
    return 'network_failed';
  }

  return 'refresh_failed';
}

function backoffDelayMs(attempt, policy) {
  return Math.min(policy.initialBackoffMs * 2 ** Math.max(attempt - 1, 0), policy.maxBackoffMs);
}

function normalizeRefreshResponse(response = {}, record, errors) {
  if (!isPlainObject(response)) {
    errors.push('Token refresh response must be an object.');
    return null;
  }

  collectRawCredentialErrors(response, errors);

  const credentialRef = normalizeReference(
    response.credentialRef ?? response[record.credentialField] ?? record.credentialRef,
    'Token refresh response credentialRef',
    errors
  );
  const refreshTokenRef =
    response.refreshTokenRef === undefined
      ? record.refreshTokenRef
      : normalizeReference(response.refreshTokenRef, 'Token refresh response refreshTokenRef', errors);
  const expiresAt = normalizeOptionalTimestamp(response.expiresAt, 'Token refresh response expiresAt', errors);
  const issuedAt = normalizeOptionalTimestamp(response.issuedAt, 'Token refresh response issuedAt', errors);

  if (!expiresAt) {
    errors.push('Token refresh response expiresAt is required.');
  }

  if (errors.length > 0) {
    return null;
  }

  return {
    ...record,
    credentialRef,
    refreshTokenRef,
    expiresAt,
    issuedAt,
    nextAttemptAt: null,
    revoked: false,
    refreshable: refreshTokenRef !== null,
    failure: null
  };
}

function refreshFailureState(record, error, attempt, nowIso, policy) {
  const category = classifyRefreshError(error);
  const message = sanitizeTokenRefreshMessage(error?.message ?? error);

  if (category === 'revoked') {
    return {
      ...reauthenticationState(record, 'revoked', message),
      refreshed: false,
      failure: {
        category,
        attempt,
        retryable: false,
        occurredAt: nowIso,
        message
      }
    };
  }

  const delayMs = backoffDelayMs(attempt, policy);
  const nextAttemptAt = new Date(Date.parse(nowIso) + delayMs).toISOString();

  return {
    id: record.id,
    integration: record.integration,
    credentialField: record.credentialField,
    expiresAt: record.expiresAt,
    refreshable: record.refreshable,
    state: 'refresh_failed',
    dueReason: category,
    refreshed: false,
    nextRefreshAt: null,
    nextAttemptAt,
    failure: {
      category,
      attempt,
      retryable: true,
      occurredAt: nowIso,
      message
    },
    reauthentication: {
      required: false
    }
  };
}

function refreshedState(record, options, refreshedAt) {
  const item = assessValidatedRecord(record, { ...options, now: refreshedAt });

  return {
    ...item,
    credentialRef: record.credentialRef,
    refreshTokenRef: record.refreshTokenRef,
    refreshed: true,
    refreshedAt,
    failure: null
  };
}

export function createTokenRefreshController(bridge, options = {}) {
  assertRefreshBridge(bridge);
  normalizePolicy(options);

  async function refresh(input = {}) {
    const now = normalizeNow(options.now);
    const assessment = assessTokenRefreshRecord(input, { ...options, now: now.iso });

    if (assessment.errors.length > 0) {
      throw new TokenRefreshError(assessment.errors.join(' '), 'invalid_token_refresh_record', assessment.errors);
    }

    if (assessment.item.state !== 'refresh_due') {
      return assessment.item;
    }

    const record = assessment.record;
    const attempt = (record.failure?.attempt ?? 0) + 1;
    const request = {
      id: record.id,
      integration: record.integration,
      credentialField: record.credentialField,
      credentialRef: record.credentialRef,
      refreshTokenRef: record.refreshTokenRef,
      expiresAt: record.expiresAt,
      requestedAt: now.iso,
      attempt
    };

    try {
      const response = await bridge.refreshToken(request);
      const errors = [];
      const refreshedRecord = normalizeRefreshResponse(response, record, errors);

      if (errors.length > 0) {
        throw new TokenRefreshError(errors.join(' '), 'invalid_refresh_response', errors);
      }

      return refreshedState(refreshedRecord, options, now.iso);
    } catch (error) {
      return refreshFailureState(record, error, attempt, now.iso, normalizePolicy(options));
    }
  }

  async function refreshDue(records = []) {
    const plan = createTokenRefreshPlan(records, options);
    const dueIds = new Set(plan.due.map((entry) => entry.id));
    const results = [];

    for (const record of records) {
      if (dueIds.has(record.id)) {
        results.push(await refresh(record));
      } else {
        results.push(assessTokenRefreshRecord(record, options).item);
      }
    }

    return {
      generatedAt: normalizeNow(options.now).iso,
      results,
      refreshed: results.filter((entry) => entry.refreshed === true),
      reauthenticationRequired: results.filter((entry) => entry.state === 'reauthentication_required'),
      retryableFailures: results.filter((entry) => entry.state === 'refresh_failed')
    };
  }

  return Object.freeze({
    plan(records = []) {
      return createTokenRefreshPlan(records, options);
    },
    refresh,
    refreshDue
  });
}
