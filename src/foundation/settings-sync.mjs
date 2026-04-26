import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { SETTINGS_SCHEMA_VERSION, createTeletonSettings } from './settings-model.mjs';
import { isSecureReference } from './proxy-settings.mjs';

export const SETTINGS_SYNC_SCHEMA_VERSION = 1;
export const SETTINGS_SYNC_PAYLOAD_KIND = 'teleton.settings.sync';
export const SETTINGS_SYNC_ENVELOPE_SCHEMA_VERSION = 1;
export const SETTINGS_SYNC_ENCRYPTED_PAYLOAD_KIND = 'teleton.settings.sync.encrypted';
export const SETTINGS_SYNC_CONFLICT_STRATEGY = 'field-level-last-writer-wins';
export const SETTINGS_SYNC_TRANSPORTS = Object.freeze(['disabled', 'manual-export', 'platform-provider', 'self-hosted']);
export const SETTINGS_SYNC_DEVICE_PLATFORMS = Object.freeze(['android', 'ios', 'desktop', 'web']);
export const SETTINGS_SYNC_KEY_PURPOSE = 'teleton.settingsSync';
export const SETTINGS_SYNC_SYNCABLE_PATHS = Object.freeze([
  'language',
  'theme',
  'notifications.enabled',
  'notifications.messagePreviews',
  'notifications.sounds',
  'notifications.mentionsOnly',
  'notifications.categories',
  'notifications.quietHours',
  'agent.model',
  'agent.requireConfirmation',
  'agent.maxAutonomousActionsPerHour'
]);
export const SETTINGS_SYNC_DEVICE_LOCAL_PATHS = Object.freeze([
  'platform',
  'sync.enabled',
  'sync.transport',
  'sync.encryptionKeyRef',
  'proxy.enabled',
  'proxy.autoSwitchEnabled',
  'proxy.activeProxyId',
  'proxy.entries[]',
  'proxy.publicCatalog',
  'agent.mode',
  'agent.allowCloudProcessing',
  'agent.providerConfig',
  'agent.memory',
  'security.requireDeviceLock',
  'security.biometricUnlock',
  'security.lockAfterMinutes',
  'security.twoFactor',
  'security.encryptAgentMemory',
  'security.agentMemoryKeyRef',
  'security.secretRefs'
]);
export const SETTINGS_SYNC_SECRET_PATHS = Object.freeze([
  'sync.encryptionKeyRef',
  'proxy.entries[].secretRef',
  'proxy.entries[].usernameRef',
  'proxy.entries[].passwordRef',
  'agent.providerConfig.apiKeyRef',
  'agent.providerConfig.tokenRef',
  'agent.memory',
  'security.agentMemoryKeyRef',
  'security.secretRefs'
]);
export const SETTINGS_SYNC_ENCRYPTION_REQUIREMENTS = deepFreeze({
  required: true,
  algorithm: 'AES-256-GCM',
  keyStorage: 'platform-secure-storage',
  keyRefScope: 'device-local',
  keyRefRequiredWhenEnabled: true
});

const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const DEVICE_DISPLAY_NAME_MAX_LENGTH = 80;

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

function mergePlainObject(base, overlay) {
  const merged = { ...base };

  for (const [key, value] of Object.entries(overlay)) {
    if (isPlainObject(value) && isPlainObject(base[key])) {
      merged[key] = mergePlainObject(base[key], value);
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

function normalizedTimestamp(value, label) {
  const timestamp = value === undefined ? new Date().toISOString() : value;
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid ISO timestamp.`);
  }

  return date.toISOString();
}

function normalizeRevision(value, label = 'Settings sync revision') {
  const revision = value === undefined ? 0 : Number(value);

  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }

  return revision;
}

function normalizeDeviceId(value, { required } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new Error('Settings sync enabled requires a stable deviceId.');
    }

    return null;
  }

  const deviceId = String(value).trim();
  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    throw new Error('Settings sync stable deviceId must use letters, numbers, dots, dashes, underscores, or colons.');
  }

  return deviceId;
}

function normalizeDevicePlatform(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const platform = String(value).trim().toLowerCase();
  if (!SETTINGS_SYNC_DEVICE_PLATFORMS.includes(platform)) {
    throw new Error(`Unsupported settings sync platform: ${value}`);
  }

  return platform;
}

function normalizeDeviceDisplayName(value, deviceId) {
  const displayName = String(value ?? deviceId).trim();

  if (!displayName) {
    throw new Error('Settings sync device displayName must be a non-empty string.');
  }

  if (displayName.length > DEVICE_DISPLAY_NAME_MAX_LENGTH) {
    throw new Error(`Settings sync device displayName must be ${DEVICE_DISPLAY_NAME_MAX_LENGTH} characters or fewer.`);
  }

  return displayName;
}

function normalizeTransport(value, enabled) {
  const transport = String(value ?? (enabled ? 'manual-export' : 'disabled')).trim();

  if (!SETTINGS_SYNC_TRANSPORTS.includes(transport)) {
    throw new Error(`Settings sync transport must be one of: ${SETTINGS_SYNC_TRANSPORTS.join(', ')}.`);
  }

  if (enabled && transport === 'disabled') {
    throw new Error('Settings sync enabled requires a non-disabled transport.');
  }

  return transport;
}

function normalizeEncryptionKeyRef(value, enabled) {
  const keyRef = value === undefined ? null : value;

  if (keyRef === null) {
    if (enabled) {
      throw new Error('Settings sync enabled requires an encryptionKeyRef secure reference.');
    }

    return null;
  }

  if (!isSecureReference(keyRef)) {
    throw new Error('Settings sync encryptionKeyRef must be a secure reference such as keychain:name or keystore:name.');
  }

  return String(keyRef).trim();
}

function getPathValue(source, path) {
  return path.split('.').reduce((current, segment) => current?.[segment], source);
}

function setPathValue(target, path, value) {
  const segments = path.split('.');
  let current = target;

  for (const segment of segments.slice(0, -1)) {
    current[segment] = isPlainObject(current[segment]) ? current[segment] : {};
    current = current[segment];
  }

  current[segments.at(-1)] = clone(value);
}

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function decode(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty base64url string.`);
  }

  return Buffer.from(value, 'base64url');
}

function assertSecureStorage(secureStorage) {
  if (!secureStorage || typeof secureStorage.get !== 'function') {
    throw new Error('Settings sync encryption requires secure storage with a get hook.');
  }
}

function normalizeEncryptionKey(key, keyRef) {
  let keyBuffer;

  if (Buffer.isBuffer(key)) {
    keyBuffer = key;
  } else if (key instanceof Uint8Array) {
    keyBuffer = Buffer.from(key);
  } else {
    keyBuffer = Buffer.from(String(key ?? ''), 'base64url');
  }

  if (keyBuffer.length !== KEY_BYTES) {
    throw new Error(`Settings sync secure storage key ${keyRef} must be ${KEY_BYTES} bytes.`);
  }

  return keyBuffer;
}

async function readEncryptionKey(secureStorage, keyRef) {
  assertSecureStorage(secureStorage);

  const key = await secureStorage.get(keyRef);
  if (key === undefined || key === null) {
    throw new Error(`Missing settings sync secure storage key: ${keyRef}.`);
  }

  return normalizeEncryptionKey(key, keyRef);
}

function normalizeEncryptedEnvelope(envelope, label) {
  if (!isPlainObject(envelope)) {
    throw new Error(`${label} settings sync encrypted envelope must be an object.`);
  }

  if (envelope.kind !== SETTINGS_SYNC_ENCRYPTED_PAYLOAD_KIND) {
    throw new Error(`${label} settings sync encrypted envelope has unsupported kind: ${envelope.kind}.`);
  }

  if (!Number.isInteger(envelope.schemaVersion)) {
    throw new Error(`${label} settings sync encrypted envelope schemaVersion must be an integer.`);
  }

  if (envelope.schemaVersion > SETTINGS_SYNC_ENVELOPE_SCHEMA_VERSION) {
    throw new Error(
      `${label} settings sync encrypted envelope schema version ${envelope.schemaVersion} is newer than this client supports (${SETTINGS_SYNC_ENVELOPE_SCHEMA_VERSION}).`
    );
  }

  if (envelope.payloadKind !== SETTINGS_SYNC_PAYLOAD_KIND) {
    throw new Error(`${label} settings sync encrypted envelope payloadKind must be ${SETTINGS_SYNC_PAYLOAD_KIND}.`);
  }

  if (envelope.encryption?.algorithm !== SETTINGS_SYNC_ENCRYPTION_REQUIREMENTS.algorithm) {
    throw new Error(
      `${label} settings sync encrypted envelope must use ${SETTINGS_SYNC_ENCRYPTION_REQUIREMENTS.algorithm}.`
    );
  }

  return envelope;
}

function timestampValue(value) {
  return typeof value === 'function' ? value() : value;
}

async function publishToSyncTransport(syncTransport, envelope) {
  if (syncTransport === undefined || syncTransport === null) {
    return null;
  }

  if (typeof syncTransport.publish === 'function') {
    return syncTransport.publish(envelope);
  }

  if (typeof syncTransport.write === 'function') {
    return syncTransport.write(envelope);
  }

  throw new Error('Settings sync transport must provide a publish(envelope) or write(envelope) hook.');
}

async function readLatestFromSyncTransport(syncTransport, options = {}) {
  if (!syncTransport || typeof syncTransport.readLatest !== 'function') {
    throw new Error('Settings sync transport must provide a readLatest(options) hook.');
  }

  return syncTransport.readLatest(options);
}

function withLocalEncryptionKeyRef(options = {}) {
  return {
    ...options,
    encryptionKeyRef: options.encryptionKeyRef ?? options.keyRef
  };
}

function guardNonActivatingAgentSettings(candidate, current) {
  const guarded = clone(candidate);
  const ignoredPaths = [];

  if (
    current.agent?.mode === 'off' &&
    Number.isInteger(guarded.agent?.maxAutonomousActionsPerHour) &&
    guarded.agent.maxAutonomousActionsPerHour !== 0
  ) {
    guarded.agent.maxAutonomousActionsPerHour = current.agent.maxAutonomousActionsPerHour;
    ignoredPaths.push('agent.maxAutonomousActionsPerHour');
  }

  return {
    settings: guarded,
    ignoredPaths
  };
}

function metadataForPayload(payload, path) {
  const metadata = payload.fieldMetadata?.[path] ?? {};

  return {
    updatedAt: metadata.updatedAt ?? payload.updatedAt ?? payload.createdAt,
    revision: metadata.revision ?? payload.revision ?? 0,
    deviceId: metadata.deviceId ?? payload.deviceId
  };
}

function normalizePayload(payload, label) {
  if (!isPlainObject(payload)) {
    throw new Error(`${label} settings sync payload must be an object.`);
  }

  if (payload.kind !== SETTINGS_SYNC_PAYLOAD_KIND) {
    throw new Error(`${label} settings sync payload has unsupported kind: ${payload.kind}.`);
  }

  if (!Number.isInteger(payload.schemaVersion)) {
    throw new Error(`${label} settings sync payload schemaVersion must be an integer.`);
  }

  if (payload.schemaVersion > SETTINGS_SYNC_SCHEMA_VERSION) {
    throw new Error(
      `${label} settings sync payload schema version ${payload.schemaVersion} is newer than this client supports (${SETTINGS_SYNC_SCHEMA_VERSION}).`
    );
  }

  if (!isPlainObject(payload.settings)) {
    throw new Error(`${label} settings sync payload settings must be an object.`);
  }

  return payload;
}

function compareMetadata(local, remote) {
  const localUpdatedAt = Date.parse(local.updatedAt);
  const remoteUpdatedAt = Date.parse(remote.updatedAt);

  if (Number.isNaN(localUpdatedAt) || Number.isNaN(remoteUpdatedAt)) {
    throw new Error('Settings sync conflict metadata must use valid updatedAt timestamps.');
  }

  if (localUpdatedAt !== remoteUpdatedAt) {
    return {
      winner: localUpdatedAt > remoteUpdatedAt ? 'local' : 'remote',
      reason: 'newer-updatedAt'
    };
  }

  if (local.revision !== remote.revision) {
    return {
      winner: local.revision > remote.revision ? 'local' : 'remote',
      reason: 'higher-revision'
    };
  }

  if (local.deviceId !== remote.deviceId) {
    return {
      winner: local.deviceId > remote.deviceId ? 'local' : 'remote',
      reason: 'lexicographic-device-id'
    };
  }

  return {
    winner: 'local',
    reason: 'identical-metadata'
  };
}

function normalizeConflictChange(change, label) {
  if (!isPlainObject(change)) {
    throw new Error(`${label} settings sync change must be an object.`);
  }

  if (!SETTINGS_SYNC_SYNCABLE_PATHS.includes(change.path)) {
    throw new Error(`${label} settings sync change path is not syncable: ${change.path}.`);
  }

  return {
    path: change.path,
    value: clone(change.value),
    updatedAt: normalizedTimestamp(change.updatedAt, `${label} settings sync updatedAt`),
    revision: normalizeRevision(change.revision, `${label} settings sync revision`),
    deviceId: normalizeDeviceId(change.deviceId, { required: true })
  };
}

export function createSettingsSyncDeviceIdentity(input = {}) {
  const deviceId = normalizeDeviceId(input.deviceId, { required: true });

  return {
    deviceId,
    platform: normalizeDevicePlatform(input.platform),
    displayName: normalizeDeviceDisplayName(input.displayName ?? input.name, deviceId),
    enrolledAt: normalizedTimestamp(input.enrolledAt ?? input.createdAt, 'Settings sync device enrolledAt')
  };
}

export function createSettingsSyncPlan(input = {}) {
  const enabled = input.enabled === true;
  const transport = normalizeTransport(input.transport, enabled);
  const deviceId = normalizeDeviceId(input.deviceId, { required: enabled });
  const encryptionKeyRef = normalizeEncryptionKeyRef(input.encryptionKeyRef, enabled);

  return {
    enabled,
    transport,
    deviceId,
    conflictStrategy: SETTINGS_SYNC_CONFLICT_STRATEGY,
    syncablePaths: [...SETTINGS_SYNC_SYNCABLE_PATHS],
    deviceLocalPaths: [...SETTINGS_SYNC_DEVICE_LOCAL_PATHS],
    secretPaths: [...SETTINGS_SYNC_SECRET_PATHS],
    encryption: {
      required: SETTINGS_SYNC_ENCRYPTION_REQUIREMENTS.required,
      algorithm: SETTINGS_SYNC_ENCRYPTION_REQUIREMENTS.algorithm,
      keyStorage: SETTINGS_SYNC_ENCRYPTION_REQUIREMENTS.keyStorage,
      keyRefScope: SETTINGS_SYNC_ENCRYPTION_REQUIREMENTS.keyRefScope,
      keyRef: encryptionKeyRef
    }
  };
}

export function validateSettingsSyncPlan(input = {}) {
  try {
    return {
      valid: true,
      errors: [],
      plan: createSettingsSyncPlan(input)
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error.message],
      plan: undefined
    };
  }
}

export function extractSyncableTeletonSettings(input = {}) {
  const settings = createTeletonSettings(input);
  const syncable = {};

  for (const path of SETTINGS_SYNC_SYNCABLE_PATHS) {
    setPathValue(syncable, path, getPathValue(settings, path));
  }

  return syncable;
}

export function createSettingsSyncPayload(settings = {}, options = {}) {
  const plan = createSettingsSyncPlan(options);

  if (!plan.enabled) {
    return {
      kind: SETTINGS_SYNC_PAYLOAD_KIND,
      schemaVersion: SETTINGS_SYNC_SCHEMA_VERSION,
      settingsSchemaVersion: SETTINGS_SCHEMA_VERSION,
      skipped: true,
      reason: 'settings-sync-disabled',
      transport: plan.transport,
      conflictStrategy: plan.conflictStrategy,
      syncablePaths: [...SETTINGS_SYNC_SYNCABLE_PATHS],
      deviceLocalPaths: [...SETTINGS_SYNC_DEVICE_LOCAL_PATHS],
      secretPaths: [...SETTINGS_SYNC_SECRET_PATHS],
      encryption: {
        required: SETTINGS_SYNC_ENCRYPTION_REQUIREMENTS.required,
        algorithm: SETTINGS_SYNC_ENCRYPTION_REQUIREMENTS.algorithm,
        keyRefScope: SETTINGS_SYNC_ENCRYPTION_REQUIREMENTS.keyRefScope
      }
    };
  }

  const updatedAt = normalizedTimestamp(options.updatedAt, 'Settings sync updatedAt');
  const revision = normalizeRevision(options.revision);
  const syncableSettings = extractSyncableTeletonSettings(settings);
  const fieldMetadata = {};

  for (const path of SETTINGS_SYNC_SYNCABLE_PATHS) {
    fieldMetadata[path] = {
      updatedAt,
      revision,
      deviceId: plan.deviceId
    };
  }

  return {
    kind: SETTINGS_SYNC_PAYLOAD_KIND,
    schemaVersion: SETTINGS_SYNC_SCHEMA_VERSION,
    settingsSchemaVersion: SETTINGS_SCHEMA_VERSION,
    skipped: false,
    transport: plan.transport,
    createdAt: updatedAt,
    updatedAt,
    deviceId: plan.deviceId,
    revision,
    conflictStrategy: plan.conflictStrategy,
    syncablePaths: [...SETTINGS_SYNC_SYNCABLE_PATHS],
    deviceLocalPaths: [...SETTINGS_SYNC_DEVICE_LOCAL_PATHS],
    secretPaths: [...SETTINGS_SYNC_SECRET_PATHS],
    encryption: {
      required: SETTINGS_SYNC_ENCRYPTION_REQUIREMENTS.required,
      algorithm: SETTINGS_SYNC_ENCRYPTION_REQUIREMENTS.algorithm,
      keyStorage: SETTINGS_SYNC_ENCRYPTION_REQUIREMENTS.keyStorage,
      keyRefScope: SETTINGS_SYNC_ENCRYPTION_REQUIREMENTS.keyRefScope
    },
    settings: syncableSettings,
    fieldMetadata
  };
}

export async function encryptSettingsSyncPayload(payload, { secureStorage, keyRef, encryptedAt } = {}) {
  const normalized = normalizePayload(payload, 'Encrypted');
  const resolvedKeyRef = normalizeEncryptionKeyRef(keyRef, true);
  const key = await readEncryptionKey(secureStorage, resolvedKeyRef);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_BYTES });
  const plaintext = Buffer.from(JSON.stringify(normalized), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    kind: SETTINGS_SYNC_ENCRYPTED_PAYLOAD_KIND,
    schemaVersion: SETTINGS_SYNC_ENVELOPE_SCHEMA_VERSION,
    payloadKind: SETTINGS_SYNC_PAYLOAD_KIND,
    payloadSchemaVersion: normalized.schemaVersion,
    settingsSchemaVersion: normalized.settingsSchemaVersion,
    encryptedAt: normalizedTimestamp(encryptedAt, 'Settings sync encryptedAt'),
    deviceId: normalized.deviceId,
    payloadUpdatedAt: normalized.updatedAt,
    revision: normalized.revision,
    encryption: {
      required: SETTINGS_SYNC_ENCRYPTION_REQUIREMENTS.required,
      algorithm: SETTINGS_SYNC_ENCRYPTION_REQUIREMENTS.algorithm,
      keyStorage: SETTINGS_SYNC_ENCRYPTION_REQUIREMENTS.keyStorage,
      keyRefScope: SETTINGS_SYNC_ENCRYPTION_REQUIREMENTS.keyRefScope,
      purpose: SETTINGS_SYNC_KEY_PURPOSE,
      iv: encode(iv),
      authTag: encode(authTag)
    },
    ciphertext: encode(ciphertext)
  };
}

export async function decryptSettingsSyncPayload(envelope, { secureStorage, keyRef } = {}) {
  const normalized = normalizeEncryptedEnvelope(envelope, 'Encrypted');
  const resolvedKeyRef = normalizeEncryptionKeyRef(keyRef, true);
  const key = await readEncryptionKey(secureStorage, resolvedKeyRef);
  const decipher = createDecipheriv('aes-256-gcm', key, decode(normalized.encryption.iv, 'Settings sync iv'), {
    authTagLength: AUTH_TAG_BYTES
  });

  decipher.setAuthTag(decode(normalized.encryption.authTag, 'Settings sync authTag'));

  const plaintext = Buffer.concat([
    decipher.update(decode(normalized.ciphertext, 'Settings sync ciphertext')),
    decipher.final()
  ]);
  const payload = normalizePayload(JSON.parse(plaintext.toString('utf8')), 'Decrypted');

  if (payload.deviceId !== normalized.deviceId) {
    throw new Error('Settings sync encrypted envelope deviceId does not match the decrypted payload.');
  }

  return payload;
}

export function resolveSettingsSyncConflict(localChange, remoteChange) {
  const local = normalizeConflictChange(localChange, 'Local');
  const remote = normalizeConflictChange(remoteChange, 'Remote');

  if (local.path !== remote.path) {
    throw new Error(`Settings sync conflict paths must match: ${local.path} !== ${remote.path}.`);
  }

  const resolution = compareMetadata(local, remote);
  const winner = resolution.winner === 'local' ? local : remote;

  return {
    strategy: SETTINGS_SYNC_CONFLICT_STRATEGY,
    path: local.path,
    winner: resolution.winner,
    reason: resolution.reason,
    value: clone(winner.value),
    local: {
      updatedAt: local.updatedAt,
      revision: local.revision,
      deviceId: local.deviceId
    },
    remote: {
      updatedAt: remote.updatedAt,
      revision: remote.revision,
      deviceId: remote.deviceId
    }
  };
}

export function mergeSettingsSyncPayloads(localPayload, remotePayload) {
  const local = normalizePayload(localPayload, 'Local');
  const remote = normalizePayload(remotePayload, 'Remote');
  const settings = {};
  const conflicts = [];

  for (const path of SETTINGS_SYNC_SYNCABLE_PATHS) {
    const localValue = getPathValue(local.settings, path);
    const remoteValue = getPathValue(remote.settings, path);

    if (jsonEqual(localValue, remoteValue)) {
      setPathValue(settings, path, localValue);
      continue;
    }

    const resolution = resolveSettingsSyncConflict(
      {
        path,
        value: localValue,
        ...metadataForPayload(local, path)
      },
      {
        path,
        value: remoteValue,
        ...metadataForPayload(remote, path)
      }
    );

    setPathValue(settings, path, resolution.value);
    conflicts.push(resolution);
  }

  return {
    strategy: SETTINGS_SYNC_CONFLICT_STRATEGY,
    settings,
    conflicts
  };
}

export function applySettingsSyncPayload(currentSettings = {}, remotePayload, options = {}) {
  const current = createTeletonSettings(currentSettings);
  const localOptions = withLocalEncryptionKeyRef(options);
  const plan = createSettingsSyncPlan(localOptions);

  if (!plan.enabled) {
    return {
      skipped: true,
      reason: 'settings-sync-disabled',
      settings: current,
      conflicts: [],
      ignoredPaths: []
    };
  }

  const localPayload = createSettingsSyncPayload(current, localOptions);
  const normalizedRemotePayload = normalizePayload(remotePayload, 'Remote');
  const merged = mergeSettingsSyncPayloads(localPayload, normalizedRemotePayload);
  const guarded = guardNonActivatingAgentSettings(mergePlainObject(current, merged.settings), current);

  return {
    skipped: false,
    settings: createTeletonSettings(guarded.settings),
    conflicts: merged.conflicts,
    ignoredPaths: guarded.ignoredPaths,
    localPayload,
    remotePayload: normalizedRemotePayload
  };
}

export async function publishSettingsSyncSnapshot(settings = {}, options = {}) {
  const localOptions = withLocalEncryptionKeyRef(options);
  const payload = createSettingsSyncPayload(settings, localOptions);

  if (payload.skipped) {
    return {
      skipped: true,
      reason: payload.reason,
      payload,
      envelope: null,
      record: null
    };
  }

  const envelope = await encryptSettingsSyncPayload(payload, {
    secureStorage: options.secureStorage,
    keyRef: localOptions.encryptionKeyRef,
    encryptedAt: options.encryptedAt ?? payload.updatedAt
  });
  const record = await publishToSyncTransport(options.syncTransport, envelope);

  return {
    skipped: false,
    payload,
    envelope,
    record
  };
}

export async function pullSettingsSyncSnapshot(currentSettings = {}, options = {}) {
  const localOptions = withLocalEncryptionKeyRef(options);
  const plan = createSettingsSyncPlan(localOptions);
  const settings = createTeletonSettings(currentSettings);

  if (!plan.enabled) {
    return {
      skipped: true,
      reason: 'settings-sync-disabled',
      settings,
      conflicts: [],
      ignoredPaths: [],
      record: null,
      remotePayload: null
    };
  }

  const record = await readLatestFromSyncTransport(options.syncTransport, {
    excludeDeviceId: plan.deviceId
  });

  if (!record) {
    return {
      skipped: true,
      reason: 'settings-sync-no-remote-payload',
      settings,
      conflicts: [],
      ignoredPaths: [],
      record: null,
      remotePayload: null
    };
  }

  const envelope = record.envelope ?? record;
  const remotePayload = await decryptSettingsSyncPayload(envelope, {
    secureStorage: options.secureStorage,
    keyRef: localOptions.encryptionKeyRef
  });
  const applied = applySettingsSyncPayload(settings, remotePayload, localOptions);

  return {
    ...applied,
    record,
    remotePayload
  };
}

export function createMemorySettingsSyncTransport(options = {}) {
  const records = (options.records ?? []).map((record) => clone(record));
  let nextId = records.length;

  return Object.freeze({
    async publish(envelope) {
      const normalizedEnvelope = normalizeEncryptedEnvelope(envelope, 'Published');
      const storedAt = normalizedTimestamp(timestampValue(options.now), 'Settings sync transport storedAt');
      const record = {
        id: `settings-sync-${String(++nextId).padStart(6, '0')}`,
        storedAt,
        envelope: clone(normalizedEnvelope)
      };

      records.push(record);
      return clone(record);
    },
    async write(envelope) {
      return this.publish(envelope);
    },
    async readLatest(filter = {}) {
      const candidates = records.filter((record) => {
        if (filter.excludeDeviceId && record.envelope?.deviceId === filter.excludeDeviceId) {
          return false;
        }

        return true;
      });

      return candidates.length > 0 ? clone(candidates.at(-1)) : null;
    },
    async list() {
      return clone(records);
    },
    async clear() {
      records.length = 0;
      return { cleared: true };
    }
  });
}
