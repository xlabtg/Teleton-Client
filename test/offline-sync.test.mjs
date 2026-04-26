import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { createMockSecureStorageProvider } from '../src/foundation/agent-memory-store.mjs';
import {
  OFFLINE_SYNC_ACTION_CAPABILITIES,
  OFFLINE_SYNC_SECRET_PATHS,
  createMemoryOfflineSyncPersistence,
  createOfflineModeSnapshot,
  createOfflineSyncQueue,
  decryptOfflineSyncQueue
} from '../src/foundation/offline-sync.mjs';

test('offline mode distinguishes cached state from live state and unsupported actions', () => {
  const snapshot = createOfflineModeSnapshot({
    online: false,
    lastLiveAt: '2026-04-26T12:00:00.000Z',
    resources: [
      {
        id: 'chat-list',
        type: 'chat.list',
        cachedAt: '2026-04-26T11:59:00.000Z',
        recordCount: 8
      },
      {
        id: 'wallet-balance',
        type: 'wallet.balance',
        cachedAt: '2026-04-26T11:50:00.000Z'
      }
    ]
  });

  assert.equal(snapshot.connection.state, 'offline');
  assert.equal(snapshot.connection.lastLiveAt, '2026-04-26T12:00:00.000Z');
  assert.equal(snapshot.resources[0].source, 'cache');
  assert.equal(snapshot.resources[0].stale, true);
  assert.equal(snapshot.resources[0].userVisibleState, 'cached-offline');
  assert.equal(snapshot.resources[1].readableOffline, false);
  assert.equal(snapshot.resources[1].userVisibleState, 'unavailable-offline');

  assert.equal(OFFLINE_SYNC_ACTION_CAPABILITIES['message.send'].queueable, true);
  assert.equal(OFFLINE_SYNC_ACTION_CAPABILITIES['wallet.signTransaction'].queueable, false);
  assert.equal(OFFLINE_SYNC_ACTION_CAPABILITIES['wallet.signTransaction'].unsupportedOfflineReason, 'requires-live-signing');
});

test('offline queue keeps queued actions visible, cancellable, and encrypted at rest', async () => {
  const keyRef = 'keychain:offline-sync.desktop';
  const secureStorage = createMockSecureStorageProvider({
    values: {
      [keyRef]: Buffer.alloc(32, 9)
    }
  });
  const persistence = createMemoryOfflineSyncPersistence();
  const queue = createOfflineSyncQueue({
    deviceId: 'desktop-a',
    now: () => '2026-04-26T12:00:00.000Z'
  });

  const queued = queue.enqueueAction({
    type: 'message.send',
    label: 'Send message',
    target: { type: 'chat', id: 'chat-42' },
    payload: {
      chatId: 'chat-42',
      messageText: 'private offline message',
      chatTitle: 'Secret chat',
      attachmentRef: 'keychain:pending-upload'
    },
    conflict: {
      strategy: 'base-revision',
      baseRevision: 7
    }
  });

  assert.equal(queued.status, 'queued');
  assert.equal(queued.cancellable, true);
  assert.equal(queue.getVisibleState().queuedCount, 1);
  assert.equal(queue.getVisibleState().items[0].payloadPreview.chatId, 'chat-42');
  assert.equal(queue.getVisibleState().items[0].payloadPreview.attachmentConfigured, true);
  assert.doesNotMatch(JSON.stringify(queue.getVisibleState()), /private offline message|Secret chat|keychain:pending-upload/);

  const envelope = await queue.persist({
    persistence,
    secureStorage,
    keyRef,
    now: '2026-04-26T12:01:00.000Z'
  });
  const stored = await persistence.read();
  const decrypted = await decryptOfflineSyncQueue(envelope, { secureStorage, keyRef });

  assert.equal(stored.kind, 'teleton.offlineSync.queue.encrypted');
  assert.deepEqual(decrypted.actions.map((action) => action.id), [queued.id]);
  assert.ok(OFFLINE_SYNC_SECRET_PATHS.includes('actions[].payload.messageText'));
  assert.doesNotMatch(JSON.stringify(stored), /private offline message|Secret chat|keychain:pending-upload|offline-sync\.desktop/);

  const restored = createOfflineSyncQueue({ deviceId: 'desktop-a' });
  await restored.restore({ persistence, secureStorage, keyRef });
  const cancelled = restored.cancelAction(queued.id, { reason: 'user-cancelled-before-reconnect' });

  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.cancellable, false);
  assert.equal(restored.getVisibleState().items[0].status, 'cancelled');
});

test('offline queue retries, reports conflicts, and skips cancelled actions on reconnect', async () => {
  let now = '2026-04-26T12:00:00.000Z';
  const queue = createOfflineSyncQueue({
    deviceId: 'desktop-a',
    now: () => now
  });
  const sent = [];

  const retrying = queue.enqueueAction({
    id: 'queued-1',
    type: 'message.send',
    target: { type: 'chat', id: 'chat-42' },
    payload: { chatId: 'chat-42', text: 'retry me' },
    conflict: { strategy: 'base-revision', baseRevision: 2 }
  });
  const cancelled = queue.enqueueAction({
    id: 'queued-2',
    type: 'message.send',
    target: { type: 'chat', id: 'chat-43' },
    payload: { chatId: 'chat-43', text: 'cancel me' }
  });
  queue.cancelAction(cancelled.id);

  const firstFlush = await queue.flushQueuedActions({
    online: true,
    execute: async (action) => {
      sent.push(action.id);
      return {
        status: 'retry',
        reason: 'network-timeout',
        retryAfterMs: 30_000
      };
    }
  });

  assert.deepEqual(sent, [retrying.id]);
  assert.equal(firstFlush.results[0].status, 'retry');
  assert.equal(queue.getAction(retrying.id).status, 'queued');
  assert.equal(queue.getAction(retrying.id).attempts, 1);
  assert.equal(queue.getAction(retrying.id).nextAttemptAt, '2026-04-26T12:00:30.000Z');
  assert.equal(queue.getAction(cancelled.id).status, 'cancelled');

  now = '2026-04-26T12:00:31.000Z';
  const conflictFlush = await queue.flushQueuedActions({
    online: true,
    execute: async () => ({
      status: 'conflict',
      reason: 'remote-state-changed',
      remoteRevision: 4
    })
  });

  assert.equal(conflictFlush.results[0].status, 'conflict');
  assert.equal(queue.getAction(retrying.id).status, 'conflict');
  assert.equal(queue.getAction(retrying.id).cancellable, true);
  assert.equal(queue.getVisibleState().conflictCount, 1);
});

test('offline sync design is documented with queue and secure persistence boundaries', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const architecture = await readFile(new URL('../docs/architecture.md', import.meta.url), 'utf8');

  assert.match(readme, /offline synchronization/i);
  assert.match(architecture, /Offline Mode/i);
  assert.match(architecture, /cached-offline/i);
  assert.match(architecture, /queued actions/i);
  assert.match(architecture, /AES-256-GCM/i);
});
