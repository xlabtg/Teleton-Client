import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AGENT_MEMORY_KEY_PURPOSE,
  createAgentMemoryStore,
  createMockSecureStorageProvider,
  decryptAgentMemoryPayload,
  encryptAgentMemoryPayload,
  migratePlainAgentMemory
} from '../src/foundation/agent-memory-store.mjs';

const sampleMemory = Object.freeze({
  facts: [{ id: 'f1', text: 'User prefers local agent mode.' }],
  vectorIndexes: [{ id: 'chat-1', dimensions: 3, values: [0.1, 0.2, 0.3] }],
  credentials: {
    tdlib: 'secure-reference-only'
  }
});

test('agent memory encryption stores ciphertext and unlocks with platform secure storage key', async () => {
  const secureStorage = createMockSecureStorageProvider();
  const store = createAgentMemoryStore({ platform: 'desktop', secureStorage });

  const encrypted = await store.encrypt(sampleMemory);

  assert.equal(encrypted.schemaVersion, 1);
  assert.equal(encrypted.encryption.algorithm, 'AES-256-GCM');
  assert.equal(encrypted.encryption.keyRef, 'keychain:teleton.agentMemory.desktop.v1');
  assert.notEqual(encrypted.ciphertext.includes('User prefers local agent mode.'), true);
  assert.deepEqual(secureStorage.calls.map((call) => call.operation), ['get', 'set']);

  const unlocked = await store.decrypt(encrypted);
  assert.deepEqual(unlocked, sampleMemory);
});

test('agent memory encryption rejects locked and missing-key secure storage states', async () => {
  const lockedStore = createAgentMemoryStore({
    platform: 'ios',
    secureStorage: createMockSecureStorageProvider({ locked: true })
  });

  await assert.rejects(() => lockedStore.encrypt(sampleMemory), /secure storage is locked/);

  const secureStorage = createMockSecureStorageProvider();
  const store = createAgentMemoryStore({ platform: 'android', secureStorage });
  const encrypted = await store.encrypt(sampleMemory);
  await secureStorage.delete(encrypted.encryption.keyRef);

  await assert.rejects(() => store.decrypt(encrypted), /Missing secure storage key/);
});

test('agent memory migration encrypts legacy plaintext payloads and preserves encrypted payloads', async () => {
  const secureStorage = createMockSecureStorageProvider();
  const migrated = await migratePlainAgentMemory(sampleMemory, {
    platform: 'desktop',
    secureStorage
  });

  assert.equal(migrated.migrated, true);
  assert.deepEqual(await decryptAgentMemoryPayload(migrated.payload, { secureStorage }), sampleMemory);

  const unchanged = await migratePlainAgentMemory(migrated.payload, {
    platform: 'desktop',
    secureStorage
  });

  assert.equal(unchanged.migrated, false);
  assert.deepEqual(unchanged.payload, migrated.payload);
});

test('agent memory key rotation re-encrypts data under a new platform key reference', async () => {
  const secureStorage = createMockSecureStorageProvider();
  const store = createAgentMemoryStore({ platform: 'web', secureStorage });
  const encrypted = await encryptAgentMemoryPayload(sampleMemory, {
    platform: 'web',
    secureStorage
  });
  const rotated = await store.rotateKey(encrypted, { keyRef: 'keystore:teleton.agentMemory.web.v2' });

  assert.equal(rotated.encryption.keyRef, 'keystore:teleton.agentMemory.web.v2');
  assert.equal(rotated.encryption.purpose, AGENT_MEMORY_KEY_PURPOSE);
  assert.deepEqual(await store.decrypt(rotated), sampleMemory);
});
