import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const AGENT_MEMORY_SCHEMA_VERSION = 1;
export const AGENT_MEMORY_ENCRYPTION_ALGORITHM = 'AES-256-GCM';
export const AGENT_MEMORY_KEY_PURPOSE = 'teleton.agentMemory';
export const AGENT_MEMORY_PLATFORMS = Object.freeze(['android', 'ios', 'desktop', 'web']);

const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function clone(value) {
  return structuredClone(value);
}

function normalizePlatform(value) {
  const platform = String(value ?? '').trim().toLowerCase();

  if (!AGENT_MEMORY_PLATFORMS.includes(platform)) {
    throw new Error(`Unsupported agent memory platform: ${value}`);
  }

  return platform;
}

function defaultKeyRef(platform) {
  const prefix = platform === 'ios' || platform === 'desktop' ? 'keychain' : 'keystore';
  return `${prefix}:${AGENT_MEMORY_KEY_PURPOSE}.${platform}.v1`;
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
  if (!secureStorage || typeof secureStorage.get !== 'function' || typeof secureStorage.set !== 'function') {
    throw new Error('Agent memory encryption requires secure storage with get and set hooks.');
  }
}

function normalizeKey(key, keyRef) {
  const keyBuffer = Buffer.isBuffer(key) ? key : Buffer.from(String(key ?? ''), 'base64url');

  if (keyBuffer.length !== KEY_BYTES) {
    throw new Error(`Secure storage key ${keyRef} must be ${KEY_BYTES} bytes.`);
  }

  return keyBuffer;
}

async function readKey(secureStorage, keyRef) {
  const key = await secureStorage.get(keyRef);

  if (key === undefined || key === null) {
    throw new Error(`Missing secure storage key: ${keyRef}.`);
  }

  return normalizeKey(key, keyRef);
}

async function getOrCreateKey(secureStorage, keyRef) {
  const existing = await secureStorage.get(keyRef);

  if (existing !== undefined && existing !== null) {
    return normalizeKey(existing, keyRef);
  }

  const key = randomBytes(KEY_BYTES);
  await secureStorage.set(keyRef, key);
  return key;
}

function isEncryptedAgentMemoryPayload(payload) {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    payload.schemaVersion === AGENT_MEMORY_SCHEMA_VERSION &&
    payload.encryption?.algorithm === AGENT_MEMORY_ENCRYPTION_ALGORITHM &&
    typeof payload.ciphertext === 'string'
  );
}

export function createMockSecureStorageProvider(options = {}) {
  const calls = [];
  const values = new Map(Object.entries(options.values ?? {}));

  function assertUnlocked() {
    if (options.locked) {
      throw new Error('Platform secure storage is locked.');
    }
  }

  return {
    calls,
    async get(keyRef) {
      calls.push({ operation: 'get', keyRef });
      assertUnlocked();
      return values.get(keyRef) ?? null;
    },
    async set(keyRef, value) {
      calls.push({ operation: 'set', keyRef });
      assertUnlocked();
      values.set(keyRef, Buffer.from(value));
    },
    async delete(keyRef) {
      calls.push({ operation: 'delete', keyRef });
      assertUnlocked();
      values.delete(keyRef);
    },
    snapshot() {
      return new Map(values);
    }
  };
}

export async function encryptAgentMemoryPayload(memory, { platform, secureStorage, keyRef } = {}) {
  assertSecureStorage(secureStorage);

  const normalizedPlatform = normalizePlatform(platform);
  const resolvedKeyRef = keyRef ?? defaultKeyRef(normalizedPlatform);
  const key = await getOrCreateKey(secureStorage, resolvedKeyRef);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: AUTH_TAG_BYTES });
  const plaintext = Buffer.from(JSON.stringify(memory), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    schemaVersion: AGENT_MEMORY_SCHEMA_VERSION,
    encryption: {
      algorithm: AGENT_MEMORY_ENCRYPTION_ALGORITHM,
      keyRef: resolvedKeyRef,
      purpose: AGENT_MEMORY_KEY_PURPOSE,
      platform: normalizedPlatform,
      iv: encode(iv),
      authTag: encode(authTag)
    },
    ciphertext: encode(ciphertext)
  };
}

export async function decryptAgentMemoryPayload(payload, { secureStorage } = {}) {
  assertSecureStorage(secureStorage);

  if (!isEncryptedAgentMemoryPayload(payload)) {
    throw new Error('Agent memory payload is not encrypted.');
  }

  const key = await readKey(secureStorage, payload.encryption.keyRef);
  const decipher = createDecipheriv('aes-256-gcm', key, decode(payload.encryption.iv, 'Agent memory iv'), {
    authTagLength: AUTH_TAG_BYTES
  });
  decipher.setAuthTag(decode(payload.encryption.authTag, 'Agent memory authTag'));
  const plaintext = Buffer.concat([decipher.update(decode(payload.ciphertext, 'Agent memory ciphertext')), decipher.final()]);

  return JSON.parse(plaintext.toString('utf8'));
}

export async function migratePlainAgentMemory(payload, { platform, secureStorage, keyRef } = {}) {
  if (isEncryptedAgentMemoryPayload(payload)) {
    return {
      migrated: false,
      payload: clone(payload)
    };
  }

  return {
    migrated: true,
    payload: await encryptAgentMemoryPayload(payload, { platform, secureStorage, keyRef })
  };
}

export function createAgentMemoryStore({ platform, secureStorage, keyRef } = {}) {
  assertSecureStorage(secureStorage);
  const normalizedPlatform = normalizePlatform(platform);
  const resolvedKeyRef = keyRef ?? defaultKeyRef(normalizedPlatform);

  return {
    async encrypt(memory) {
      return encryptAgentMemoryPayload(memory, {
        platform: normalizedPlatform,
        secureStorage,
        keyRef: resolvedKeyRef
      });
    },
    async decrypt(payload) {
      return decryptAgentMemoryPayload(payload, { secureStorage });
    },
    async migrate(payload) {
      return migratePlainAgentMemory(payload, {
        platform: normalizedPlatform,
        secureStorage,
        keyRef: resolvedKeyRef
      });
    },
    async rotateKey(payload, { keyRef: nextKeyRef } = {}) {
      const memory = await decryptAgentMemoryPayload(payload, { secureStorage });

      return encryptAgentMemoryPayload(memory, {
        platform: normalizedPlatform,
        secureStorage,
        keyRef: nextKeyRef ?? resolvedKeyRef
      });
    },
    keyRef() {
      return resolvedKeyRef;
    }
  };
}
