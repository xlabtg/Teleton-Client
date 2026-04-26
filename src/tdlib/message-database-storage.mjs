import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { TDLIB_PLATFORMS } from './client-adapter.mjs';

export const MESSAGE_DATABASE_SCHEMA_VERSION = 1;
export const MESSAGE_DATABASE_ENCRYPTED_KIND = 'teleton.messageDatabase.encrypted';
export const MESSAGE_DATABASE_ENCRYPTION_ALGORITHM = 'AES-256-GCM';
export const MESSAGE_DATABASE_KEY_PURPOSE = 'teleton.messageDatabase';
export const MESSAGE_DATABASE_ENCRYPTION_BOUNDARIES = Object.freeze([
  'messages',
  'indexes',
  'attachmentsMetadata'
]);
export const MESSAGE_DATABASE_RESTORE_STATUSES = Object.freeze([
  'empty',
  'unlocked',
  'migrated',
  'migration-required',
  'locked',
  'missing-key',
  'failed-decryption',
  'failed-migration'
]);

const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export class MessageDatabaseStorageError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'MessageDatabaseStorageError';
    this.code = code;
    this.details = details;
  }
}

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

function normalizePlatform(value) {
  const platform = String(value ?? '').trim().toLowerCase();

  if (!TDLIB_PLATFORMS.includes(platform)) {
    throw new MessageDatabaseStorageError(`Unsupported message database platform: ${value}`, 'unsupported_platform');
  }

  return platform;
}

function defaultKeyRef(platform) {
  const prefix = platform === 'ios' || platform === 'desktop' ? 'keychain' : 'keystore';
  return `${prefix}:${MESSAGE_DATABASE_KEY_PURPOSE}.${platform}.v1`;
}

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function decode(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new MessageDatabaseStorageError(`${label} must be a non-empty base64url string.`, 'invalid_envelope');
  }

  return Buffer.from(value, 'base64url');
}

function assertSecureStorage(secureStorage, { write = false } = {}) {
  if (!secureStorage || typeof secureStorage.get !== 'function') {
    throw new MessageDatabaseStorageError(
      'Message database encryption requires secure storage with a get hook.',
      'invalid_secure_storage'
    );
  }

  if (write && typeof secureStorage.set !== 'function') {
    throw new MessageDatabaseStorageError(
      'Message database encryption requires secure storage with a set hook.',
      'invalid_secure_storage'
    );
  }
}

function normalizeKey(key, keyRef) {
  let keyBuffer;

  if (Buffer.isBuffer(key)) {
    keyBuffer = key;
  } else if (key instanceof Uint8Array) {
    keyBuffer = Buffer.from(key);
  } else {
    keyBuffer = Buffer.from(String(key ?? ''), 'base64url');
  }

  if (keyBuffer.length !== KEY_BYTES) {
    throw new MessageDatabaseStorageError(
      `Message database secure storage key ${keyRef} must be ${KEY_BYTES} bytes.`,
      'invalid_key'
    );
  }

  return keyBuffer;
}

async function readKey(secureStorage, keyRef) {
  assertSecureStorage(secureStorage);

  const key = await secureStorage.get(keyRef);
  if (key === undefined || key === null) {
    throw new MessageDatabaseStorageError(
      `Missing message database secure storage key: ${keyRef}.`,
      'missing-key',
      { keyRef }
    );
  }

  return normalizeKey(key, keyRef);
}

async function getOrCreateKey(secureStorage, keyRef) {
  assertSecureStorage(secureStorage, { write: true });

  const existing = await secureStorage.get(keyRef);
  if (existing !== undefined && existing !== null) {
    return normalizeKey(existing, keyRef);
  }

  const key = randomBytes(KEY_BYTES);
  await secureStorage.set(keyRef, key);
  return key;
}

function normalizePlainSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) {
    throw new MessageDatabaseStorageError('Message database snapshot must be an object.', 'invalid_plaintext');
  }

  const normalized = clone(snapshot);

  if (normalized.messages === undefined) {
    normalized.messages = [];
  }

  if (!Array.isArray(normalized.messages)) {
    throw new MessageDatabaseStorageError('Message database messages must be an array.', 'invalid_plaintext');
  }

  if (normalized.indexes === undefined) {
    normalized.indexes = {};
  }

  if (!isPlainObject(normalized.indexes)) {
    throw new MessageDatabaseStorageError('Message database indexes must be an object.', 'invalid_plaintext');
  }

  if (normalized.attachmentsMetadata === undefined) {
    normalized.attachmentsMetadata = [];
  }

  if (!Array.isArray(normalized.attachmentsMetadata)) {
    throw new MessageDatabaseStorageError(
      'Message database attachmentsMetadata must be an array.',
      'invalid_plaintext'
    );
  }

  return normalized;
}

export function isEncryptedMessageDatabaseSnapshot(snapshot) {
  return (
    isPlainObject(snapshot) &&
    snapshot.kind === MESSAGE_DATABASE_ENCRYPTED_KIND &&
    Number.isInteger(snapshot.schemaVersion) &&
    snapshot.encryption?.algorithm === MESSAGE_DATABASE_ENCRYPTION_ALGORITHM &&
    typeof snapshot.ciphertext === 'string'
  );
}

function normalizeEncryptedSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) {
    throw new MessageDatabaseStorageError('Message database encrypted snapshot must be an object.', 'invalid_envelope');
  }

  if (snapshot.kind !== MESSAGE_DATABASE_ENCRYPTED_KIND) {
    throw new MessageDatabaseStorageError(
      `Unsupported message database snapshot kind: ${snapshot.kind}.`,
      'invalid_envelope'
    );
  }

  if (!Number.isInteger(snapshot.schemaVersion)) {
    throw new MessageDatabaseStorageError(
      'Message database encrypted snapshot schemaVersion must be an integer.',
      'invalid_envelope'
    );
  }

  if (snapshot.schemaVersion > MESSAGE_DATABASE_SCHEMA_VERSION) {
    throw new MessageDatabaseStorageError(
      `Message database encrypted snapshot schema version ${snapshot.schemaVersion} is newer than this client supports (${MESSAGE_DATABASE_SCHEMA_VERSION}).`,
      'unsupported_schema'
    );
  }

  if (snapshot.encryption?.algorithm !== MESSAGE_DATABASE_ENCRYPTION_ALGORITHM) {
    throw new MessageDatabaseStorageError(
      `Message database encrypted snapshot must use ${MESSAGE_DATABASE_ENCRYPTION_ALGORITHM}.`,
      'invalid_envelope'
    );
  }

  if (typeof snapshot.encryption.keyRef !== 'string' || snapshot.encryption.keyRef.trim().length === 0) {
    throw new MessageDatabaseStorageError(
      'Message database encrypted snapshot must include an encryption keyRef.',
      'invalid_envelope'
    );
  }

  return snapshot;
}

function restoreErrorFor(error) {
  const code = error?.code;
  const message = String(error?.message ?? error ?? 'Message database restore failed.');

  if (code === 'missing-key') {
    return 'missing-key';
  }

  if (/locked/i.test(message)) {
    return 'locked';
  }

  if (code === 'failed-decryption') {
    return 'failed-decryption';
  }

  return 'failed-decryption';
}

function failureState(status, error, snapshot) {
  return deepFreeze({
    status,
    migrated: false,
    database: null,
    snapshot: snapshot === undefined ? null : clone(snapshot),
    preserved: snapshot !== undefined && snapshot !== null,
    requiresUserConsentToReset: snapshot !== undefined && snapshot !== null,
    error: {
      name: error?.name ?? 'Error',
      code: error?.code ?? status,
      message: String(error?.message ?? error ?? 'Message database restore failed.')
    }
  });
}

export async function encryptMessageDatabaseSnapshot(database, { platform, secureStorage, keyRef, now } = {}) {
  const normalizedPlatform = normalizePlatform(platform);
  const resolvedKeyRef = keyRef ?? defaultKeyRef(normalizedPlatform);
  const key = await getOrCreateKey(secureStorage, resolvedKeyRef);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_BYTES });
  const plaintext = Buffer.from(JSON.stringify(normalizePlainSnapshot(database)), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return deepFreeze({
    kind: MESSAGE_DATABASE_ENCRYPTED_KIND,
    schemaVersion: MESSAGE_DATABASE_SCHEMA_VERSION,
    encryptedAt: new Date(now ?? Date.now()).toISOString(),
    encryption: {
      algorithm: MESSAGE_DATABASE_ENCRYPTION_ALGORITHM,
      keyRef: resolvedKeyRef,
      keyRefScope: 'device-local',
      keyStorage: 'platform-secure-storage',
      purpose: MESSAGE_DATABASE_KEY_PURPOSE,
      platform: normalizedPlatform,
      boundaries: [...MESSAGE_DATABASE_ENCRYPTION_BOUNDARIES],
      iv: encode(iv),
      authTag: encode(authTag)
    },
    ciphertext: encode(ciphertext)
  });
}

export async function decryptMessageDatabaseSnapshot(snapshot, { secureStorage } = {}) {
  const normalized = normalizeEncryptedSnapshot(snapshot);
  const key = await readKey(secureStorage, normalized.encryption.keyRef);

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      decode(normalized.encryption.iv, 'Message database iv'),
      { authTagLength: AUTH_TAG_BYTES }
    );
    decipher.setAuthTag(decode(normalized.encryption.authTag, 'Message database authTag'));
    const plaintext = Buffer.concat([
      decipher.update(decode(normalized.ciphertext, 'Message database ciphertext')),
      decipher.final()
    ]);

    return normalizePlainSnapshot(JSON.parse(plaintext.toString('utf8')));
  } catch (error) {
    throw new MessageDatabaseStorageError(
      `Unable to decrypt message database snapshot: ${error.message}`,
      'failed-decryption'
    );
  }
}

export async function migratePlainMessageDatabaseSnapshot(snapshot, { platform, secureStorage, keyRef } = {}) {
  if (isEncryptedMessageDatabaseSnapshot(snapshot)) {
    return deepFreeze({
      migrated: false,
      snapshot: clone(snapshot)
    });
  }

  return deepFreeze({
    migrated: true,
    snapshot: await encryptMessageDatabaseSnapshot(snapshot, { platform, secureStorage, keyRef })
  });
}

export function createMemoryMessageDatabasePersistence(input = {}) {
  let stored = input.initialSnapshot === undefined ? null : clone(input.initialSnapshot);
  const operations = [];

  return Object.freeze({
    operations,
    async write(snapshot) {
      operations.push({ type: 'write' });
      stored = clone(snapshot);
      return clone(stored);
    },
    async read() {
      operations.push({ type: 'read' });
      return stored === null ? null : clone(stored);
    },
    async clear({ confirmed = false } = {}) {
      operations.push({ type: 'clear', confirmed });
      if (confirmed !== true) {
        throw new MessageDatabaseStorageError(
          'Message database snapshots require explicit user consent before deletion.',
          'consent_required'
        );
      }

      stored = null;
      return null;
    }
  });
}

export function createMessageDatabaseStore({ platform, secureStorage, keyRef, persistence } = {}) {
  assertSecureStorage(secureStorage, { write: true });
  const normalizedPlatform = normalizePlatform(platform ?? 'desktop');
  const resolvedKeyRef = keyRef ?? defaultKeyRef(normalizedPlatform);

  return Object.freeze({
    async encrypt(database) {
      return encryptMessageDatabaseSnapshot(database, {
        platform: normalizedPlatform,
        secureStorage,
        keyRef: resolvedKeyRef
      });
    },
    async decrypt(snapshot) {
      return decryptMessageDatabaseSnapshot(snapshot, { secureStorage });
    },
    async migrate(snapshot) {
      return migratePlainMessageDatabaseSnapshot(snapshot, {
        platform: normalizedPlatform,
        secureStorage,
        keyRef: resolvedKeyRef
      });
    },
    async write(database) {
      const snapshot = await encryptMessageDatabaseSnapshot(database, {
        platform: normalizedPlatform,
        secureStorage,
        keyRef: resolvedKeyRef
      });

      if (persistence !== undefined && persistence !== null) {
        if (typeof persistence.write !== 'function') {
          throw new MessageDatabaseStorageError(
            'Message database persistence must provide a write(snapshot) hook.',
            'invalid_persistence'
          );
        }

        await persistence.write(snapshot);
      }

      return snapshot;
    },
    async restore({ migratePlaintext = false } = {}) {
      if (!persistence || typeof persistence.read !== 'function') {
        throw new MessageDatabaseStorageError(
          'Message database restore requires persistence with a read() hook.',
          'invalid_persistence'
        );
      }

      const snapshot = await persistence.read();
      if (snapshot === null) {
        return deepFreeze({
          status: 'empty',
          migrated: false,
          database: null,
          snapshot: null,
          preserved: false,
          requiresUserConsentToReset: false,
          error: null
        });
      }

      if (isEncryptedMessageDatabaseSnapshot(snapshot)) {
        try {
          const database = await decryptMessageDatabaseSnapshot(snapshot, { secureStorage });
          return deepFreeze({
            status: 'unlocked',
            migrated: false,
            database,
            snapshot: clone(snapshot),
            preserved: true,
            requiresUserConsentToReset: false,
            error: null
          });
        } catch (error) {
          return failureState(restoreErrorFor(error), error, snapshot);
        }
      }

      if (migratePlaintext !== true) {
        return failureState(
          'migration-required',
          new MessageDatabaseStorageError(
            'Legacy plaintext message database snapshot requires migration before use.',
            'migration-required'
          ),
          snapshot
        );
      }

      try {
        const database = normalizePlainSnapshot(snapshot);
        const migrated = await encryptMessageDatabaseSnapshot(database, {
          platform: normalizedPlatform,
          secureStorage,
          keyRef: resolvedKeyRef
        });

        if (typeof persistence.write !== 'function') {
          throw new MessageDatabaseStorageError(
            'Message database migration requires persistence with a write(snapshot) hook.',
            'invalid_persistence'
          );
        }

        await persistence.write(migrated);

        return deepFreeze({
          status: 'migrated',
          migrated: true,
          database,
          snapshot: migrated,
          preserved: true,
          requiresUserConsentToReset: false,
          error: null
        });
      } catch (error) {
        return failureState('failed-migration', error, snapshot);
      }
    },
    keyRef() {
      return resolvedKeyRef;
    }
  });
}
