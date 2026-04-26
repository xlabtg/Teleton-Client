import { SETTINGS_SCHEMA_VERSION, createTeletonSettings } from './settings-model.mjs';
import { isSecureReference } from './proxy-settings.mjs';

export const SETTINGS_SYNC_SCHEMA_VERSION = 1;
export const SETTINGS_SYNC_PAYLOAD_KIND = 'teleton.settings.sync';
export const SETTINGS_SYNC_CONFLICT_STRATEGY = 'field-level-last-writer-wins';
export const SETTINGS_SYNC_TRANSPORTS = Object.freeze(['disabled', 'manual-export', 'platform-provider', 'self-hosted']);
export const SETTINGS_SYNC_SYNCABLE_PATHS = Object.freeze([
  'language',
  'theme',
  'notifications.enabled',
  'notifications.messagePreviews',
  'notifications.sounds',
  'notifications.mentionsOnly',
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

const DEVICE_ID_PATTERN = /^[A-Za-z0-9_.:-]+$/;

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
    throw new Error('Settings sync deviceId must use letters, numbers, dots, dashes, underscores, or colons.');
  }

  return deviceId;
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
