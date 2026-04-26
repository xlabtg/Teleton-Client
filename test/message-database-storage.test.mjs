import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { createMockSecureStorageProvider } from '../src/foundation/agent-memory-store.mjs';
import { createTeletonSettings, validateTeletonSettings } from '../src/foundation/settings-model.mjs';
import {
  MESSAGE_DATABASE_ENCRYPTION_BOUNDARIES,
  MESSAGE_DATABASE_KEY_PURPOSE,
  createMemoryMessageDatabasePersistence,
  createMessageDatabaseStore,
  migratePlainMessageDatabaseSnapshot
} from '../src/tdlib/message-database-storage.mjs';

const sampleDatabase = Object.freeze({
  messages: [
    {
      id: 'message-1',
      chatId: 'chat-1',
      senderId: 'user-1',
      text: 'private message body',
      sentAt: '2026-04-26T12:00:00.000Z'
    }
  ],
  indexes: {
    byChat: {
      'chat-1': ['message-1']
    },
    fullTextTerms: ['private', 'message']
  },
  attachmentsMetadata: [
    {
      id: 'attachment-1',
      messageId: 'message-1',
      fileName: 'passport-scan.jpg',
      mimeType: 'image/jpeg',
      cacheRef: 'keychain:tdlib-attachment-cache'
    }
  ]
});

test('message database encryption stores messages, indexes, and attachment metadata as ciphertext', async () => {
  const secureStorage = createMockSecureStorageProvider();
  const store = createMessageDatabaseStore({ platform: 'desktop', secureStorage });

  const encrypted = await store.encrypt(sampleDatabase);

  assert.equal(encrypted.kind, 'teleton.messageDatabase.encrypted');
  assert.equal(encrypted.schemaVersion, 1);
  assert.equal(encrypted.encryption.algorithm, 'AES-256-GCM');
  assert.equal(encrypted.encryption.keyRef, 'keychain:teleton.messageDatabase.desktop.v1');
  assert.equal(encrypted.encryption.purpose, MESSAGE_DATABASE_KEY_PURPOSE);
  assert.deepEqual(encrypted.encryption.boundaries, MESSAGE_DATABASE_ENCRYPTION_BOUNDARIES);
  assert.doesNotMatch(
    JSON.stringify(encrypted),
    /private message body|passport-scan|chat-1|tdlib-attachment-cache/
  );
  assert.deepEqual(secureStorage.calls.map((call) => call.operation), ['get', 'set']);

  const unlocked = await store.decrypt(encrypted);
  assert.deepEqual(unlocked, sampleDatabase);
});

test('message database restore reports locked secure storage without deleting encrypted data', async () => {
  const keyRef = 'keychain:teleton.messageDatabase.ios.v1';
  const unlockedStorage = createMockSecureStorageProvider({
    values: {
      [keyRef]: Buffer.alloc(32, 7)
    }
  });
  const encrypted = await createMessageDatabaseStore({
    platform: 'ios',
    secureStorage: unlockedStorage
  }).encrypt(sampleDatabase);
  const persistence = createMemoryMessageDatabasePersistence({ initialSnapshot: encrypted });
  const lockedStore = createMessageDatabaseStore({
    platform: 'ios',
    secureStorage: createMockSecureStorageProvider({
      locked: true,
      values: {
        [keyRef]: Buffer.alloc(32, 7)
      }
    }),
    persistence
  });

  const restored = await lockedStore.restore();

  assert.equal(restored.status, 'locked');
  assert.equal(restored.database, null);
  assert.equal(restored.preserved, true);
  assert.equal(restored.requiresUserConsentToReset, true);
  assert.match(restored.error.message, /secure storage is locked/i);
  assert.deepEqual(await persistence.read(), encrypted);
  assert.deepEqual(persistence.operations.map((operation) => operation.type), ['read', 'read']);
});

test('message database migration encrypts legacy plaintext snapshots before storing them again', async () => {
  const secureStorage = createMockSecureStorageProvider();
  const persistence = createMemoryMessageDatabasePersistence({ initialSnapshot: sampleDatabase });
  const store = createMessageDatabaseStore({ platform: 'android', secureStorage, persistence });

  const restored = await store.restore({ migratePlaintext: true });

  assert.equal(restored.status, 'migrated');
  assert.equal(restored.migrated, true);
  assert.deepEqual(restored.database, sampleDatabase);

  const stored = await persistence.read();
  assert.equal(stored.kind, 'teleton.messageDatabase.encrypted');
  assert.doesNotMatch(JSON.stringify(stored), /private message body|passport-scan|tdlib-attachment-cache/);
  assert.deepEqual(await store.decrypt(stored), sampleDatabase);

  const unchanged = await migratePlainMessageDatabaseSnapshot(stored, {
    platform: 'android',
    secureStorage
  });
  assert.equal(unchanged.migrated, false);
  assert.deepEqual(unchanged.snapshot, stored);
});

test('message database failed decryption preserves the original snapshot for explicit recovery', async () => {
  const secureStorage = createMockSecureStorageProvider();
  const store = createMessageDatabaseStore({ platform: 'web', secureStorage });
  const encrypted = await store.encrypt(sampleDatabase);
  const tampered = {
    ...encrypted,
    ciphertext: `${encrypted.ciphertext.slice(0, -2)}xx`
  };
  const persistence = createMemoryMessageDatabasePersistence({ initialSnapshot: tampered });
  const restoreStore = createMessageDatabaseStore({ platform: 'web', secureStorage, persistence });

  const restored = await restoreStore.restore();

  assert.equal(restored.status, 'failed-decryption');
  assert.equal(restored.database, null);
  assert.equal(restored.preserved, true);
  assert.equal(restored.requiresUserConsentToReset, true);
  assert.match(restored.error.message, /decrypt/i);
  assert.deepEqual(await persistence.read(), tampered);
  assert.deepEqual(persistence.operations.map((operation) => operation.type), ['read', 'read']);
});

test('message database encryption is enforced in settings and documented', async () => {
  const settings = createTeletonSettings();

  assert.equal(settings.security.encryptMessageDatabase, true);
  assert.equal(settings.security.messageDatabaseKeyRef, null);

  const invalid = validateTeletonSettings({
    security: {
      encryptMessageDatabase: false,
      messageDatabaseKeyRef: 'plain-database-key'
    }
  });

  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join('\n'), /Message database encryption must remain enabled/);
  assert.match(invalid.errors.join('\n'), /messageDatabaseKeyRef/);

  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const architecture = await readFile(new URL('../docs/architecture.md', import.meta.url), 'utf8');
  const securityAudit = await readFile(new URL('../docs/security-audit.md', import.meta.url), 'utf8');

  assert.match(readme, /message database/i);
  assert.match(architecture, /Message Database Encryption/i);
  assert.match(architecture, /messages, indexes, and attachments metadata/i);
  assert.match(securityAudit, /Message database encryption keys/i);
});
