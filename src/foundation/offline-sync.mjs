import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const OFFLINE_SYNC_SCHEMA_VERSION = 1;
export const OFFLINE_SYNC_QUEUE_KIND = 'teleton.offlineSync.queue';
export const OFFLINE_SYNC_ENCRYPTED_QUEUE_KIND = 'teleton.offlineSync.queue.encrypted';
export const OFFLINE_SYNC_CONFLICT_STRATEGY = 'base-revision-before-replay';
export const OFFLINE_SYNC_READABLE_RESOURCE_TYPES = Object.freeze([
  'chat.list',
  'chat.thread',
  'message.history',
  'settings.view',
  'agent.action.history',
  'ton.transaction.history'
]);
export const OFFLINE_SYNC_ACTION_STATUSES = Object.freeze([
  'queued',
  'syncing',
  'synced',
  'failed',
  'conflict',
  'cancelled',
  'unsupported'
]);
export const OFFLINE_SYNC_SECRET_PATHS = Object.freeze([
  'actions[].payload.message',
  'actions[].payload.messageText',
  'actions[].payload.text',
  'actions[].payload.content',
  'actions[].payload.body',
  'actions[].payload.chatTitle',
  'actions[].payload.chatName',
  'actions[].payload.senderName',
  'actions[].payload.recipientName',
  'actions[].payload.prompt',
  'actions[].payload.attachmentRef',
  'actions[].payload.secretRef',
  'actions[].payload.usernameRef',
  'actions[].payload.passwordRef',
  'actions[].payload.walletAddress',
  'actions[].payload.amount',
  'actions[].payload.mnemonic',
  'actions[].payload.privateKey',
  'actions[].payload.token'
]);
export const OFFLINE_SYNC_ENCRYPTION_REQUIREMENTS = deepFreeze({
  required: true,
  algorithm: 'AES-256-GCM',
  keyStorage: 'platform-secure-storage',
  keyRefScope: 'device-local'
});
export const OFFLINE_SYNC_ACTION_CAPABILITIES = deepFreeze({
  'message.send': {
    queueable: true,
    cancellableUntil: 'before-sync',
    retryable: true,
    conflictStrategy: OFFLINE_SYNC_CONFLICT_STRATEGY,
    persistence: 'encrypted'
  },
  'message.edit': {
    queueable: true,
    cancellableUntil: 'before-sync',
    retryable: true,
    conflictStrategy: OFFLINE_SYNC_CONFLICT_STRATEGY,
    persistence: 'encrypted'
  },
  'settings.update': {
    queueable: true,
    cancellableUntil: 'before-sync',
    retryable: true,
    conflictStrategy: 'field-level-last-writer-wins',
    persistence: 'encrypted'
  },
  'message.delete': {
    queueable: false,
    unsupportedOfflineReason: 'requires-live-state'
  },
  'agent.action.approve': {
    queueable: false,
    unsupportedOfflineReason: 'requires-live-agent'
  },
  'wallet.signTransaction': {
    queueable: false,
    unsupportedOfflineReason: 'requires-live-signing'
  }
});

const KEY_BYTES = 32;
const IV_BYTES = 12;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const SECURE_REFERENCE_PATTERN = /\b(?:env|keychain|keystore|secret):[A-Za-z0-9_.:/-]+/;
const PRIVATE_PAYLOAD_FIELDS = new Set([
  'message',
  'messageText',
  'text',
  'content',
  'body',
  'chatTitle',
  'chatName',
  'senderName',
  'recipientName',
  'prompt',
  'walletAddress',
  'amount',
  'mnemonic',
  'privateKey',
  'token',
  'secret',
  'password'
]);

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  Object.freeze(value);

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return value;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTimestamp(value, label = 'Offline sync timestamp') {
  const timestamp = value === undefined ? new Date().toISOString() : value;
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid ISO timestamp.`);
  }

  return date.toISOString();
}

function normalizeOptionalTimestamp(value, label) {
  if (value === undefined || value === null) {
    return null;
  }

  return normalizeTimestamp(value, label);
}

function normalizeId(value, fieldName) {
  const id = String(value ?? '').trim();

  if (!id) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return id;
}

function normalizeOptionalId(value, fallback, fieldName) {
  const id = String(value ?? fallback).trim();

  if (!id) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return id;
}

function normalizeDeviceId(value = 'local-device') {
  const deviceId = normalizeId(value, 'Offline sync deviceId');

  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    throw new Error('Offline sync deviceId must use letters, numbers, dots, dashes, underscores, or colons.');
  }

  return deviceId;
}

function normalizeActionType(value) {
  const type = normalizeId(value, 'Offline sync action type');

  if (!OFFLINE_SYNC_ACTION_CAPABILITIES[type]) {
    throw new Error(`Unsupported offline sync action type: ${value}`);
  }

  return type;
}

function normalizeStatus(value) {
  const status = String(value ?? 'queued').trim();

  if (!OFFLINE_SYNC_ACTION_STATUSES.includes(status)) {
    throw new Error(`Unsupported offline sync action status: ${value}`);
  }

  return status;
}

function normalizeTarget(input = {}) {
  if (!isPlainObject(input)) {
    throw new Error('Offline sync action target must be an object.');
  }

  return Object.freeze({
    type: normalizeOptionalId(input.type, 'resource', 'Offline sync action target type'),
    id: normalizeId(input.id, 'Offline sync action target id')
  });
}

function normalizeNonNegativeInteger(value, fieldName) {
  const number = value === undefined ? 0 : Number(value);

  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }

  return number;
}

function normalizeConflict(input = {}, capability = {}) {
  const conflict = isPlainObject(input) ? input : {};
  const strategy = String(conflict.strategy ?? capability.conflictStrategy ?? 'none').trim();

  return Object.freeze({
    strategy,
    baseRevision: conflict.baseRevision ?? null,
    remoteRevision: conflict.remoteRevision ?? null,
    reason: conflict.reason ?? null
  });
}

function visibleConflict(conflict) {
  if (!conflict || conflict.strategy === 'none') {
    return null;
  }

  return {
    strategy: conflict.strategy,
    baseRevision: conflict.baseRevision,
    remoteRevision: conflict.remoteRevision,
    reason: conflict.reason
  };
}

function stripRefSuffix(key) {
  return key.endsWith('Ref') ? key.slice(0, -3) : key;
}

function redactPayloadForPreview(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  const redacted = {};

  for (const [key, fieldValue] of Object.entries(value)) {
    if (key.endsWith('Ref')) {
      redacted[`${stripRefSuffix(key)}Configured`] = fieldValue !== undefined && fieldValue !== null && fieldValue !== '';
      continue;
    }

    if (PRIVATE_PAYLOAD_FIELDS.has(key)) {
      continue;
    }

    if (isPlainObject(fieldValue)) {
      redacted[key] = redactPayloadForPreview(fieldValue);
    } else if (Array.isArray(fieldValue)) {
      redacted[`${key}Count`] = fieldValue.length;
    } else if (typeof fieldValue === 'string' && SECURE_REFERENCE_PATTERN.test(fieldValue)) {
      redacted[`${key}Configured`] = true;
    } else {
      redacted[key] = fieldValue;
    }
  }

  return redacted;
}

function actionCanBeCancelled(action) {
  return ['queued', 'conflict'].includes(action.status);
}

function normalizeAction(input = {}, options = {}) {
  if (!isPlainObject(input)) {
    throw new Error('Offline sync action must be an object.');
  }

  const type = normalizeActionType(input.type);
  const capability = OFFLINE_SYNC_ACTION_CAPABILITIES[type];
  const now = normalizeTimestamp(options.now ?? input.updatedAt ?? input.createdAt, 'Offline sync action timestamp');
  const status = capability.queueable === false ? 'unsupported' : normalizeStatus(input.status);
  const id = normalizeOptionalId(input.id, `${type}:${now}:${options.sequence ?? 0}`, 'Offline sync action id');
  const normalized = {
    id,
    type,
    label: normalizeOptionalId(input.label, type, 'Offline sync action label'),
    status,
    deviceId: normalizeDeviceId(input.deviceId ?? options.deviceId),
    target: normalizeTarget(input.target ?? { type: 'resource', id: input.targetId ?? id }),
    payload: isPlainObject(input.payload) ? clone(input.payload) : {},
    payloadPreview: redactPayloadForPreview(input.payload),
    conflict: normalizeConflict(input.conflict, capability),
    attempts: normalizeNonNegativeInteger(input.attempts, 'Offline sync action attempts'),
    createdAt: normalizeTimestamp(input.createdAt ?? now, 'Offline sync action createdAt'),
    updatedAt: normalizeTimestamp(input.updatedAt ?? now, 'Offline sync action updatedAt'),
    nextAttemptAt: normalizeOptionalTimestamp(input.nextAttemptAt, 'Offline sync action nextAttemptAt'),
    lastError: input.lastError ?? null,
    completedAt: normalizeOptionalTimestamp(input.completedAt, 'Offline sync action completedAt'),
    remoteId: input.remoteId ?? null,
    cancellation: isPlainObject(input.cancellation)
      ? {
          reason: input.cancellation.reason ?? 'user-cancelled',
          cancelledAt: normalizeTimestamp(input.cancellation.cancelledAt, 'Offline sync action cancelledAt')
        }
      : null,
    unsupportedOfflineReason: capability.unsupportedOfflineReason ?? null,
    persistence: capability.persistence ?? 'none'
  };

  normalized.cancellable = actionCanBeCancelled(normalized);

  return deepFreeze(normalized);
}

function actionForReturn(action) {
  return deepFreeze(clone(action));
}

function visibleAction(action) {
  return deepFreeze({
    id: action.id,
    type: action.type,
    label: action.label,
    status: action.status,
    target: clone(action.target),
    payloadPreview: clone(action.payloadPreview),
    cancellable: action.cancellable,
    attempts: action.attempts,
    nextAttemptAt: action.nextAttemptAt,
    createdAt: action.createdAt,
    updatedAt: action.updatedAt,
    lastError: action.lastError,
    cancellation: clone(action.cancellation),
    conflict: visibleConflict(action.conflict),
    unsupportedOfflineReason: action.unsupportedOfflineReason
  });
}

function nextRetryTimestamp(now, retryAfterMs) {
  const delay = Number.isFinite(retryAfterMs) && retryAfterMs >= 0 ? Math.trunc(retryAfterMs) : 0;
  return new Date(Date.parse(now) + delay).toISOString();
}

function sanitizeErrorMessage(error) {
  return String(error?.message ?? error ?? 'Offline sync action failed.')
    .replaceAll(/\b(?:env|keychain|keystore|secret):[A-Za-z0-9_.:/-]+/g, '[redacted]')
    .slice(0, 240);
}

function updateAction(action, patch) {
  const updated = {
    ...clone(action),
    ...patch
  };
  updated.payloadPreview = redactPayloadForPreview(updated.payload);
  updated.cancellable = actionCanBeCancelled(updated);
  return deepFreeze(updated);
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
    throw new Error('Offline sync encryption requires secure storage with a get hook.');
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
    throw new Error(`Offline sync secure storage key ${keyRef} must be ${KEY_BYTES} bytes.`);
  }

  return keyBuffer;
}

async function readEncryptionKey(secureStorage, keyRef) {
  assertSecureStorage(secureStorage);

  const key = await secureStorage.get(keyRef);
  if (key === undefined || key === null) {
    throw new Error(`Missing offline sync secure storage key: ${keyRef}.`);
  }

  return normalizeEncryptionKey(key, keyRef);
}

function normalizeQueuePayload(payload, label = 'Offline sync queue') {
  if (!isPlainObject(payload)) {
    throw new Error(`${label} payload must be an object.`);
  }

  if (payload.kind !== OFFLINE_SYNC_QUEUE_KIND) {
    throw new Error(`${label} payload has unsupported kind: ${payload.kind}.`);
  }

  if (!Number.isInteger(payload.schemaVersion)) {
    throw new Error(`${label} payload schemaVersion must be an integer.`);
  }

  if (payload.schemaVersion > OFFLINE_SYNC_SCHEMA_VERSION) {
    throw new Error(
      `${label} payload schema version ${payload.schemaVersion} is newer than this client supports (${OFFLINE_SYNC_SCHEMA_VERSION}).`
    );
  }

  if (!Array.isArray(payload.actions)) {
    throw new Error(`${label} payload actions must be an array.`);
  }

  return payload;
}

function normalizeEncryptedEnvelope(envelope) {
  if (!isPlainObject(envelope)) {
    throw new Error('Offline sync encrypted envelope must be an object.');
  }

  if (envelope.kind !== OFFLINE_SYNC_ENCRYPTED_QUEUE_KIND) {
    throw new Error(`Offline sync encrypted envelope has unsupported kind: ${envelope.kind}.`);
  }

  if (!Number.isInteger(envelope.schemaVersion)) {
    throw new Error('Offline sync encrypted envelope schemaVersion must be an integer.');
  }

  if (envelope.schemaVersion > OFFLINE_SYNC_SCHEMA_VERSION) {
    throw new Error(
      `Offline sync encrypted envelope schema version ${envelope.schemaVersion} is newer than this client supports (${OFFLINE_SYNC_SCHEMA_VERSION}).`
    );
  }

  if (envelope.payloadKind !== OFFLINE_SYNC_QUEUE_KIND) {
    throw new Error(`Offline sync encrypted envelope payloadKind must be ${OFFLINE_SYNC_QUEUE_KIND}.`);
  }

  if (envelope.encryption?.algorithm !== OFFLINE_SYNC_ENCRYPTION_REQUIREMENTS.algorithm) {
    throw new Error(`Offline sync encrypted envelope must use ${OFFLINE_SYNC_ENCRYPTION_REQUIREMENTS.algorithm}.`);
  }

  return envelope;
}

function resourceUserVisibleState(readableOffline, online) {
  if (online) {
    return 'live';
  }

  return readableOffline ? 'cached-offline' : 'unavailable-offline';
}

export function createOfflineModeSnapshot(input = {}) {
  const online = input.online === true;
  const lastLiveAt = normalizeOptionalTimestamp(input.lastLiveAt, 'Offline mode lastLiveAt');
  const resources = Array.isArray(input.resources) ? input.resources : [];

  return deepFreeze({
    connection: {
      state: online ? 'live' : 'offline',
      online,
      lastLiveAt,
      userVisibleState: online ? 'live' : 'offline'
    },
    resources: resources.map((resource) => {
      if (!isPlainObject(resource)) {
        throw new Error('Offline mode resource must be an object.');
      }

      const type = normalizeId(resource.type, 'Offline mode resource type');
      const readableOffline = OFFLINE_SYNC_READABLE_RESOURCE_TYPES.includes(type);
      const userVisibleState = resourceUserVisibleState(readableOffline, online);

      return {
        id: normalizeId(resource.id, 'Offline mode resource id'),
        type,
        readableOffline,
        source: online ? 'live' : readableOffline ? 'cache' : 'unavailable',
        stale: online ? false : readableOffline,
        cachedAt: normalizeOptionalTimestamp(resource.cachedAt, 'Offline mode resource cachedAt'),
        recordCount: Number.isInteger(resource.recordCount) ? resource.recordCount : null,
        userVisibleState
      };
    }),
    readableResourceTypes: [...OFFLINE_SYNC_READABLE_RESOURCE_TYPES],
    unsupportedActionTypes: Object.entries(OFFLINE_SYNC_ACTION_CAPABILITIES)
      .filter(([, capability]) => capability.queueable === false)
      .map(([type]) => type)
  });
}

export function createOfflineQueuedAction(input = {}, options = {}) {
  return normalizeAction(input, options);
}

export function createOfflineSyncQueuePayload(actions = [], options = {}) {
  const now = normalizeTimestamp(options.now, 'Offline sync queue createdAt');
  const deviceId = normalizeDeviceId(options.deviceId);

  return deepFreeze({
    kind: OFFLINE_SYNC_QUEUE_KIND,
    schemaVersion: OFFLINE_SYNC_SCHEMA_VERSION,
    deviceId,
    createdAt: now,
    persistedAt: now,
    conflictStrategy: OFFLINE_SYNC_CONFLICT_STRATEGY,
    secretPaths: [...OFFLINE_SYNC_SECRET_PATHS],
    actions: actions.map((action, index) =>
      normalizeAction(action, {
        deviceId,
        now,
        sequence: index
      })
    )
  });
}

export async function encryptOfflineSyncQueue(actionsOrPayload = [], options = {}) {
  const keyRef = normalizeId(options.keyRef ?? options.encryptionKeyRef, 'Offline sync encryption keyRef');
  const key = await readEncryptionKey(options.secureStorage, keyRef);
  const payload = Array.isArray(actionsOrPayload)
    ? createOfflineSyncQueuePayload(actionsOrPayload, options)
    : normalizeQueuePayload(actionsOrPayload);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return deepFreeze({
    kind: OFFLINE_SYNC_ENCRYPTED_QUEUE_KIND,
    schemaVersion: OFFLINE_SYNC_SCHEMA_VERSION,
    payloadKind: OFFLINE_SYNC_QUEUE_KIND,
    deviceId: payload.deviceId,
    persistedAt: normalizeTimestamp(options.now ?? payload.persistedAt, 'Offline sync envelope persistedAt'),
    encryption: {
      algorithm: OFFLINE_SYNC_ENCRYPTION_REQUIREMENTS.algorithm,
      keyRefScope: OFFLINE_SYNC_ENCRYPTION_REQUIREMENTS.keyRefScope,
      iv: encode(iv),
      tag: encode(tag)
    },
    ciphertext: encode(ciphertext)
  });
}

export async function decryptOfflineSyncQueue(envelope, options = {}) {
  const normalized = normalizeEncryptedEnvelope(envelope);
  const keyRef = normalizeId(options.keyRef ?? options.encryptionKeyRef, 'Offline sync encryption keyRef');
  const key = await readEncryptionKey(options.secureStorage, keyRef);
  const decipher = createDecipheriv('aes-256-gcm', key, decode(normalized.encryption.iv, 'Offline sync iv'));
  decipher.setAuthTag(decode(normalized.encryption.tag, 'Offline sync auth tag'));
  const plaintext = Buffer.concat([
    decipher.update(decode(normalized.ciphertext, 'Offline sync ciphertext')),
    decipher.final()
  ]);

  return normalizeQueuePayload(JSON.parse(plaintext.toString('utf8')));
}

export function createMemoryOfflineSyncPersistence(input = {}) {
  let stored = input.initialEnvelope ? clone(input.initialEnvelope) : null;

  return Object.freeze({
    async write(envelope) {
      stored = clone(envelope);
      return clone(stored);
    },
    async read() {
      return stored === null ? null : clone(stored);
    },
    async clear() {
      stored = null;
    },
    async list() {
      return stored === null ? [] : [clone(stored)];
    }
  });
}

export function createOfflineSyncQueue(options = {}) {
  const deviceId = normalizeDeviceId(options.deviceId);
  const clock = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
  const actions = new Map();
  let sequence = 0;

  function now() {
    return normalizeTimestamp(clock(), 'Offline sync queue timestamp');
  }

  function setAction(action) {
    const normalized = normalizeAction(action, {
      deviceId,
      now: action.updatedAt ?? now(),
      sequence: sequence++
    });
    actions.set(normalized.id, normalized);
    return actionForReturn(normalized);
  }

  function getExistingAction(id) {
    const actionId = normalizeId(id, 'Offline sync action id');
    const action = actions.get(actionId);

    if (!action) {
      throw new Error(`Unknown offline sync action: ${actionId}`);
    }

    return action;
  }

  function dueQueuedActions() {
    const currentTime = Date.parse(now());

    return Array.from(actions.values())
      .filter((action) => {
        if (action.status !== 'queued') {
          return false;
        }

        if (action.nextAttemptAt === null) {
          return true;
        }

        return Date.parse(action.nextAttemptAt) <= currentTime;
      })
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  }

  function allActions() {
    return Array.from(actions.values()).sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  }

  function visibleState() {
    const items = allActions().map(visibleAction);

    return deepFreeze({
      items,
      queuedCount: items.filter((item) => item.status === 'queued').length,
      conflictCount: items.filter((item) => item.status === 'conflict').length,
      cancellableCount: items.filter((item) => item.cancellable).length,
      unsupportedCount: items.filter((item) => item.status === 'unsupported').length
    });
  }

  return Object.freeze({
    enqueueAction(input = {}) {
      return setAction({
        ...input,
        deviceId,
        createdAt: input.createdAt ?? now(),
        updatedAt: input.updatedAt ?? now()
      });
    },
    getAction(id) {
      return actionForReturn(getExistingAction(id));
    },
    listActions() {
      return allActions().map(actionForReturn);
    },
    getVisibleState() {
      return visibleState();
    },
    cancelAction(id, input = {}) {
      const action = getExistingAction(id);

      if (!actionCanBeCancelled(action)) {
        throw new Error(`Offline sync action ${action.id} cannot be cancelled from status ${action.status}.`);
      }

      return setAction(
        updateAction(action, {
          status: 'cancelled',
          updatedAt: now(),
          cancellation: {
            reason: input.reason ?? 'user-cancelled',
            cancelledAt: now()
          }
        })
      );
    },
    async flushQueuedActions(input = {}) {
      if (input.online !== true) {
        return deepFreeze({
          skipped: true,
          reason: 'offline',
          results: []
        });
      }

      if (typeof input.execute !== 'function') {
        throw new Error('Offline sync flush requires an execute(action) hook.');
      }

      const results = [];

      for (const action of dueQueuedActions()) {
        const startedAt = now();
        actions.set(
          action.id,
          updateAction(action, {
            status: 'syncing',
            updatedAt: startedAt
          })
        );

        let result;
        try {
          result = await input.execute(actionForReturn(action));
        } catch (error) {
          result = {
            status: 'retry',
            reason: sanitizeErrorMessage(error)
          };
        }

        const current = actions.get(action.id);
        const status = String(result?.status ?? 'synced').trim();
        const finishedAt = now();

        if (status === 'retry') {
          const updated = updateAction(current, {
            status: 'queued',
            attempts: current.attempts + 1,
            nextAttemptAt: nextRetryTimestamp(finishedAt, result.retryAfterMs),
            lastError: result.reason ?? 'retry',
            updatedAt: finishedAt
          });
          actions.set(action.id, updated);
          results.push({
            id: action.id,
            status: 'retry',
            reason: updated.lastError,
            nextAttemptAt: updated.nextAttemptAt
          });
          continue;
        }

        if (status === 'conflict') {
          const updated = updateAction(current, {
            status: 'conflict',
            attempts: current.attempts + 1,
            nextAttemptAt: null,
            lastError: result.reason ?? 'conflict',
            conflict: normalizeConflict(
              {
                ...current.conflict,
                remoteRevision: result.remoteRevision ?? current.conflict.remoteRevision,
                reason: result.reason ?? current.conflict.reason
              },
              OFFLINE_SYNC_ACTION_CAPABILITIES[current.type]
            ),
            updatedAt: finishedAt
          });
          actions.set(action.id, updated);
          results.push({
            id: action.id,
            status: 'conflict',
            reason: updated.conflict.reason,
            remoteRevision: updated.conflict.remoteRevision
          });
          continue;
        }

        if (status === 'failed') {
          const updated = updateAction(current, {
            status: 'failed',
            attempts: current.attempts + 1,
            nextAttemptAt: null,
            lastError: result.reason ?? 'failed',
            updatedAt: finishedAt
          });
          actions.set(action.id, updated);
          results.push({
            id: action.id,
            status: 'failed',
            reason: updated.lastError
          });
          continue;
        }

        const updated = updateAction(current, {
          status: 'synced',
          attempts: current.attempts + 1,
          nextAttemptAt: null,
          lastError: null,
          remoteId: result?.remoteId ?? current.remoteId,
          completedAt: finishedAt,
          updatedAt: finishedAt
        });
        actions.set(action.id, updated);
        results.push({
          id: action.id,
          status: 'synced',
          remoteId: updated.remoteId
        });
      }

      return deepFreeze({
        skipped: false,
        reason: null,
        results
      });
    },
    async persist(input = {}) {
      const envelope = await encryptOfflineSyncQueue(allActions(), {
        ...input,
        deviceId,
        now: input.now ?? now()
      });

      if (input.persistence !== undefined && input.persistence !== null) {
        if (typeof input.persistence.write !== 'function') {
          throw new Error('Offline sync persistence must provide a write(envelope) hook.');
        }

        await input.persistence.write(envelope);
      }

      return envelope;
    },
    async restore(input = {}) {
      if (!input.persistence || typeof input.persistence.read !== 'function') {
        throw new Error('Offline sync restore requires persistence with a read() hook.');
      }

      const envelope = await input.persistence.read();
      if (envelope === null) {
        return visibleState();
      }

      const payload = await decryptOfflineSyncQueue(envelope, input);
      actions.clear();
      sequence = 0;

      for (const action of payload.actions) {
        const normalized = normalizeAction(action, {
          deviceId: payload.deviceId,
          now: action.updatedAt ?? payload.persistedAt,
          sequence: sequence++
        });
        actions.set(normalized.id, normalized);
      }

      return visibleState();
    }
  });
}
