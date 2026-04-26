import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  SETTINGS_SYNC_CONFLICT_STRATEGY,
  SETTINGS_SYNC_DEVICE_LOCAL_PATHS,
  SETTINGS_SYNC_ENCRYPTION_REQUIREMENTS,
  SETTINGS_SYNC_SECRET_PATHS,
  SETTINGS_SYNC_SYNCABLE_PATHS,
  createSettingsSyncPayload,
  createSettingsSyncPlan,
  mergeSettingsSyncPayloads,
  resolveSettingsSyncConflict,
  validateSettingsSyncPlan
} from '../src/foundation/settings-sync.mjs';

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

test('settings sync design is documented with local-only fields and conflict behavior', async () => {
  const architecture = await readFile(new URL('../docs/architecture.md', import.meta.url), 'utf8');

  assert.match(architecture, /Settings Synchronization/i);
  assert.match(architecture, /disabled by default/i);
  assert.match(architecture, /proxy\.entries\[\]\.secretRef/i);
  assert.match(architecture, /field-level last-writer-wins/i);
  assert.match(architecture, /AES-256-GCM/i);
});
