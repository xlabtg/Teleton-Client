import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  SETTINGS_SYNC_CONFLICT_STRATEGY,
  SETTINGS_SYNC_DEVICE_LOCAL_PATHS,
  SETTINGS_SYNC_ENCRYPTED_PAYLOAD_KIND,
  SETTINGS_SYNC_ENCRYPTION_REQUIREMENTS,
  SETTINGS_SYNC_SECRET_PATHS,
  SETTINGS_SYNC_SYNCABLE_PATHS,
  createMemorySettingsSyncTransport,
  createSettingsSyncDeviceIdentity,
  createSettingsSyncPayload,
  createSettingsSyncPlan,
  decryptSettingsSyncPayload,
  mergeSettingsSyncPayloads,
  publishSettingsSyncSnapshot,
  pullSettingsSyncSnapshot,
  resolveSettingsSyncConflict,
  validateSettingsSyncPlan
} from '../src/foundation/settings-sync.mjs';
import { createMockSecureStorageProvider } from '../src/foundation/agent-memory-store.mjs';

test('settings sync stays disabled by default and does not require a cloud transport', () => {
  const plan = createSettingsSyncPlan();
  const validation = validateSettingsSyncPlan();
  const skipped = createSettingsSyncPayload({ language: 'en-US' });

  assert.equal(plan.enabled, false);
  assert.equal(plan.transport, 'disabled');
  assert.equal(plan.encryption.keyRef, null);
  assert.equal(validation.valid, true);
  assert.equal(skipped.skipped, true);
  assert.equal(skipped.reason, 'settings-sync-disabled');
  assert.equal(skipped.transport, 'disabled');
  assert.deepEqual(SETTINGS_SYNC_ENCRYPTION_REQUIREMENTS.required, true);
});

test('settings sync does not publish snapshots until the user opts in', async () => {
  const syncTransport = createMemorySettingsSyncTransport();
  const result = await publishSettingsSyncSnapshot(
    { language: 'en-US' },
    {
      syncTransport,
      updatedAt: '2026-04-26T12:00:00.000Z'
    }
  );

  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'settings-sync-disabled');
  assert.equal(result.envelope, null);
  assert.deepEqual(await syncTransport.list(), []);
});

test('settings sync device identity keeps a stable non-secret device boundary', () => {
  const identity = createSettingsSyncDeviceIdentity({
    deviceId: 'desktop-a',
    platform: 'desktop',
    displayName: 'Workstation',
    enrolledAt: '2026-04-26T12:00:00.000Z'
  });

  assert.deepEqual(identity, {
    deviceId: 'desktop-a',
    platform: 'desktop',
    displayName: 'Workstation',
    enrolledAt: '2026-04-26T12:00:00.000Z'
  });
  assert.throws(() => createSettingsSyncDeviceIdentity({ deviceId: 'desktop a' }), /stable deviceId/);
  assert.throws(
    () => createSettingsSyncDeviceIdentity({ deviceId: 'desktop-a', platform: 'watch' }),
    /Unsupported settings sync platform/
  );
});

test('settings sync payload serializes only syncable settings and excludes local secrets', () => {
  const payload = createSettingsSyncPayload(
    {
      language: 'en-US',
      theme: 'dark',
      platform: 'desktop',
      proxy: {
        enabled: true,
        activeProxyId: 'office',
        entries: [
          {
            id: 'office',
            protocol: 'mtproto',
            host: 'proxy.example',
            port: 443,
            secretRef: 'keychain:proxy-secret'
          }
        ]
      },
      notifications: {
        enabled: true,
        messagePreviews: false,
        sounds: false
      },
      agent: {
        mode: 'cloud',
        allowCloudProcessing: true,
        providerConfig: {
          id: 'teleton-cloud',
          type: 'cloud',
          modelId: 'teleton-cloud-default',
          endpointUrl: 'https://agent.teleton.example/v1',
          tokenRef: 'secret:agent-token'
        },
        model: {
          provider: 'openai',
          modelId: 'gpt-safe'
        },
        requireConfirmation: false,
        maxAutonomousActionsPerHour: 4,
        memory: {
          private: 'do-not-sync'
        }
      },
      security: {
        requireDeviceLock: true,
        lockAfterMinutes: 15,
        agentMemoryKeyRef: 'keychain:agent-memory',
        secretRefs: {
          telegramApiHash: 'env:TELEGRAM_API_HASH'
        }
      }
    },
    {
      enabled: true,
      transport: 'manual-export',
      deviceId: 'desktop-a',
      encryptionKeyRef: 'keychain:settings-sync',
      updatedAt: '2026-04-26T12:00:00.000Z',
      revision: 7
    }
  );

  const serialized = JSON.stringify(payload);

  assert.equal(payload.skipped, false);
  assert.equal(payload.deviceId, 'desktop-a');
  assert.equal(payload.revision, 7);
  assert.deepEqual(payload.syncablePaths, SETTINGS_SYNC_SYNCABLE_PATHS);
  assert.ok(SETTINGS_SYNC_SYNCABLE_PATHS.includes('notifications.quietHours'));
  assert.ok(SETTINGS_SYNC_DEVICE_LOCAL_PATHS.includes('proxy.entries[]'));
  assert.ok(SETTINGS_SYNC_SECRET_PATHS.includes('agent.providerConfig.tokenRef'));
  assert.deepEqual(payload.settings, {
    language: 'en-US',
    theme: 'dark',
    notifications: {
      enabled: true,
      messagePreviews: false,
      sounds: false,
      mentionsOnly: false,
      quietHours: {
        enabled: false,
        start: '22:00',
        end: '07:00',
        timezone: 'local'
      }
    },
    agent: {
      model: {
        provider: 'openai',
        modelId: 'gpt-safe'
      },
      requireConfirmation: false,
      maxAutonomousActionsPerHour: 4
    }
  });
  assert.doesNotMatch(
    serialized,
    /keychain:proxy-secret|secret:agent-token|keychain:agent-memory|env:TELEGRAM_API_HASH|do-not-sync|settings-sync/
  );
  assert.equal(payload.encryption.keyRef, undefined);
  assert.equal(payload.encryption.keyRefScope, 'device-local');
});

test('settings sync encrypts opt-in snapshots before transport without serializing key refs', async () => {
  const keyRef = 'keychain:settings-sync.desktop';
  const secureStorage = createMockSecureStorageProvider({
    values: {
      [keyRef]: Buffer.alloc(32, 3)
    }
  });
  const syncTransport = createMemorySettingsSyncTransport({
    now: () => '2026-04-26T12:00:00.000Z'
  });
  const result = await publishSettingsSyncSnapshot(
    {
      language: 'en-US',
      theme: 'dark',
      proxy: {
        enabled: true,
        activeProxyId: 'office',
        entries: [
          {
            id: 'office',
            protocol: 'mtproto',
            host: 'proxy.example',
            port: 443,
            secretRef: 'keychain:desktop-proxy-secret'
          }
        ]
      },
      agent: {
        mode: 'cloud',
        allowCloudProcessing: true,
        providerConfig: {
          id: 'teleton-cloud',
          type: 'cloud',
          modelId: 'teleton-cloud-default',
          endpointUrl: 'https://agent.teleton.example/v1',
          tokenRef: 'secret:desktop-agent-token'
        },
        memory: {
          local: 'desktop-memory'
        }
      },
      security: {
        agentMemoryKeyRef: 'keychain:desktop-agent-memory',
        secretRefs: {
          telegramApiHash: 'env:TELEGRAM_API_HASH'
        }
      }
    },
    {
      enabled: true,
      transport: 'manual-export',
      syncTransport,
      secureStorage,
      deviceId: 'desktop-a',
      encryptionKeyRef: keyRef,
      updatedAt: '2026-04-26T12:00:00.000Z',
      revision: 2
    }
  );

  const [record] = await syncTransport.list();
  const serializedRecord = JSON.stringify(record);
  const decrypted = await decryptSettingsSyncPayload(result.envelope, { secureStorage, keyRef });

  assert.equal(result.skipped, false);
  assert.equal(result.envelope.kind, SETTINGS_SYNC_ENCRYPTED_PAYLOAD_KIND);
  assert.equal(result.envelope.deviceId, 'desktop-a');
  assert.equal(record.envelope.deviceId, 'desktop-a');
  assert.doesNotMatch(
    serializedRecord,
    /keychain:settings-sync\.desktop|keychain:desktop-proxy-secret|secret:desktop-agent-token|desktop-memory|TELEGRAM_API_HASH/
  );
  assert.deepEqual(decrypted.settings, result.payload.settings);
});

test('settings sync conflict resolution is deterministic by timestamp revision and device id', () => {
  const older = resolveSettingsSyncConflict(
    {
      path: 'theme',
      value: 'light',
      updatedAt: '2026-04-26T12:00:00.000Z',
      revision: 3,
      deviceId: 'desktop-a'
    },
    {
      path: 'theme',
      value: 'dark',
      updatedAt: '2026-04-26T12:01:00.000Z',
      revision: 1,
      deviceId: 'desktop-b'
    }
  );

  assert.equal(older.strategy, SETTINGS_SYNC_CONFLICT_STRATEGY);
  assert.equal(older.winner, 'remote');
  assert.equal(older.value, 'dark');
  assert.equal(older.reason, 'newer-updatedAt');

  const revisionTieBreak = resolveSettingsSyncConflict(
    {
      path: 'theme',
      value: 'light',
      updatedAt: '2026-04-26T12:00:00.000Z',
      revision: 4,
      deviceId: 'desktop-a'
    },
    {
      path: 'theme',
      value: 'dark',
      updatedAt: '2026-04-26T12:00:00.000Z',
      revision: 5,
      deviceId: 'desktop-b'
    }
  );

  assert.equal(revisionTieBreak.winner, 'remote');
  assert.equal(revisionTieBreak.reason, 'higher-revision');

  const deviceTieBreak = resolveSettingsSyncConflict(
    {
      path: 'theme',
      value: 'light',
      updatedAt: '2026-04-26T12:00:00.000Z',
      revision: 5,
      deviceId: 'desktop-z'
    },
    {
      path: 'theme',
      value: 'dark',
      updatedAt: '2026-04-26T12:00:00.000Z',
      revision: 5,
      deviceId: 'desktop-b'
    }
  );

  assert.equal(deviceTieBreak.winner, 'local');
  assert.equal(deviceTieBreak.reason, 'lexicographic-device-id');
});

test('settings sync merges payloads per syncable field and reports conflicts', () => {
  const local = createSettingsSyncPayload(
    {
      language: 'en-US',
      theme: 'light',
      notifications: { sounds: true }
    },
    {
      enabled: true,
      transport: 'manual-export',
      deviceId: 'desktop-a',
      encryptionKeyRef: 'keychain:settings-sync',
      updatedAt: '2026-04-26T12:00:00.000Z',
      revision: 1
    }
  );
  const remote = createSettingsSyncPayload(
    {
      language: 'ru',
      theme: 'dark',
      notifications: { sounds: false }
    },
    {
      enabled: true,
      transport: 'manual-export',
      deviceId: 'desktop-b',
      encryptionKeyRef: 'keychain:settings-sync',
      updatedAt: '2026-04-26T12:05:00.000Z',
      revision: 1
    }
  );

  const merged = mergeSettingsSyncPayloads(local, remote);

  assert.equal(merged.settings.language, 'ru');
  assert.equal(merged.settings.theme, 'dark');
  assert.equal(merged.settings.notifications.sounds, false);
  assert.deepEqual(merged.conflicts.map((conflict) => conflict.path), [
    'language',
    'theme',
    'notifications.sounds'
  ]);
  assert.equal(merged.conflicts.every((conflict) => conflict.winner === 'remote'), true);
});

test('settings sync pull applies safe remote fields and preserves local-only secrets', async () => {
  const sharedKey = Buffer.alloc(32, 7);
  const desktopKeyRef = 'keychain:settings-sync.desktop';
  const phoneKeyRef = 'keystore:settings-sync.phone';
  const syncTransport = createMemorySettingsSyncTransport();
  const desktopStorage = createMockSecureStorageProvider({
    values: {
      [desktopKeyRef]: sharedKey
    }
  });
  const phoneStorage = createMockSecureStorageProvider({
    values: {
      [phoneKeyRef]: sharedKey
    }
  });

  await publishSettingsSyncSnapshot(
    {
      language: 'ru',
      theme: 'dark',
      notifications: { sounds: false },
      agent: {
        mode: 'cloud',
        allowCloudProcessing: true,
        model: { provider: 'openai', modelId: 'gpt-safe' },
        providerConfig: {
          id: 'teleton-cloud',
          type: 'cloud',
          modelId: 'teleton-cloud-default',
          endpointUrl: 'https://agent.teleton.example/v1',
          tokenRef: 'secret:desktop-agent-token'
        },
        requireConfirmation: false,
        maxAutonomousActionsPerHour: 3,
        memory: { facts: ['remote-memory-must-not-copy'] }
      }
    },
    {
      enabled: true,
      transport: 'manual-export',
      syncTransport,
      secureStorage: desktopStorage,
      deviceId: 'desktop-a',
      encryptionKeyRef: desktopKeyRef,
      updatedAt: '2026-04-26T12:05:00.000Z',
      revision: 4
    }
  );

  const pulled = await pullSettingsSyncSnapshot(
    {
      language: 'en-US',
      theme: 'light',
      notifications: { sounds: true },
      proxy: {
        enabled: true,
        activeProxyId: 'phone-proxy',
        entries: [
          {
            id: 'phone-proxy',
            protocol: 'socks5',
            host: '127.0.0.1',
            port: 1080,
            usernameRef: 'keychain:phone-proxy-user',
            passwordRef: 'keychain:phone-proxy-password'
          }
        ]
      },
      agent: {
        mode: 'cloud',
        allowCloudProcessing: true,
        model: { provider: 'local', modelId: 'teleton-local-small' },
        providerConfig: {
          id: 'teleton-cloud',
          type: 'cloud',
          modelId: 'teleton-cloud-default',
          endpointUrl: 'https://agent.teleton.example/v1',
          tokenRef: 'keychain:phone-agent-token'
        },
        requireConfirmation: true,
        maxAutonomousActionsPerHour: 1
      },
      security: {
        agentMemoryKeyRef: 'keychain:phone-agent-memory',
        secretRefs: {
          telegramApiHash: 'env:PHONE_TELEGRAM_API_HASH'
        }
      }
    },
    {
      enabled: true,
      transport: 'manual-export',
      syncTransport,
      secureStorage: phoneStorage,
      keyRef: phoneKeyRef,
      deviceId: 'phone-b',
      encryptionKeyRef: phoneKeyRef,
      updatedAt: '2026-04-26T12:00:00.000Z',
      revision: 1
    }
  );

  const serializedSettings = JSON.stringify(pulled.settings);

  assert.equal(pulled.skipped, false);
  assert.equal(pulled.settings.language, 'ru');
  assert.equal(pulled.settings.theme, 'dark');
  assert.equal(pulled.settings.notifications.sounds, false);
  assert.deepEqual(pulled.settings.agent.model, { provider: 'openai', modelId: 'gpt-safe' });
  assert.equal(pulled.settings.agent.providerConfig.tokenRef, 'keychain:phone-agent-token');
  assert.equal(pulled.settings.proxy.entries[0].usernameRef, 'keychain:phone-proxy-user');
  assert.equal(pulled.settings.security.agentMemoryKeyRef, 'keychain:phone-agent-memory');
  assert.doesNotMatch(serializedSettings, /desktop-agent-token|remote-memory-must-not-copy/);
  assert.equal(pulled.conflicts.every((conflict) => conflict.winner === 'remote'), true);
});

test('settings sync design is documented with local-only fields and conflict behavior', async () => {
  const architecture = await readFile(new URL('../docs/architecture.md', import.meta.url), 'utf8');

  assert.match(architecture, /Settings Synchronization/i);
  assert.match(architecture, /disabled by default/i);
  assert.match(architecture, /encrypted transport snapshot/i);
  assert.match(architecture, /stable device id/i);
  assert.match(architecture, /proxy\.entries\[\]\.secretRef/i);
  assert.match(architecture, /field-level last-writer-wins/i);
  assert.match(architecture, /AES-256-GCM/i);
});
