import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  SETTINGS_PLATFORM_WRAPPERS,
  SETTINGS_SCHEMA_VERSION,
  TELETON_SETTINGS_SCHEMA,
  createPlatformSettings,
  createTeletonSettings,
  exportPortableTeletonSettings,
  importPortableTeletonSettings,
  migrateTeletonSettings,
  previewPortableTeletonSettingsImport,
  validateTeletonSettings
} from '../src/foundation/settings-model.mjs';

test('settings defaults are serializable and keep agent and proxy disabled', () => {
  const settings = createTeletonSettings();

  assert.equal(settings.schemaVersion, SETTINGS_SCHEMA_VERSION);
  assert.equal(TELETON_SETTINGS_SCHEMA.version, SETTINGS_SCHEMA_VERSION);
  assert.deepEqual(JSON.parse(JSON.stringify(TELETON_SETTINGS_SCHEMA.defaults)), settings);
  assert.equal(settings.language, 'system');
  assert.equal(settings.theme, 'system');
  assert.equal(settings.agent.mode, 'off');
  assert.equal(settings.proxy.enabled, false);
  assert.equal(settings.proxy.activeProxyId, null);
  assert.deepEqual(settings.proxy.entries, []);
  assert.equal(settings.notifications.enabled, true);
  assert.equal(settings.security.redactSensitiveNotifications, true);
  assert.equal(settings.security.encryptAgentMemory, true);
  assert.equal(settings.security.agentMemoryKeyRef, null);
  assert.deepEqual(JSON.parse(JSON.stringify(settings)), settings);
});

test('settings validation rejects invalid proxy, notification, agent, and secret preferences', () => {
  const result = validateTeletonSettings({
    agent: { mode: 'autopilot' },
    proxy: {
      enabled: true,
      activeProxyId: 'primary',
      entries: [
        {
          id: 'primary',
          protocol: 'mtproto',
          host: 'proxy.example',
          port: 70000,
          secretRef: 'plain-secret'
        }
      ]
    },
    notifications: {
      quietHours: {
        enabled: true,
        start: '25:00',
        end: '07:00'
      }
    },
    security: {
      encryptAgentMemory: false,
      agentMemoryKeyRef: 'plain-memory-key',
      secretRefs: {
        cloudAgentToken: 'raw-token'
      }
    }
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /Unsupported agent mode/);
  assert.match(result.errors.join('\n'), /Proxy entry primary/);
  assert.match(result.errors.join('\n'), /Proxy port must be an integer/);
  assert.match(result.errors.join('\n'), /secure reference/);
  assert.match(result.errors.join('\n'), /Agent memory encryption must remain enabled/);
  assert.match(result.errors.join('\n'), /agentMemoryKeyRef/);
  assert.match(result.errors.join('\n'), /Quiet hours start/);
});

test('settings model produces valid platform snapshots for every wrapper', () => {
  assert.deepEqual(SETTINGS_PLATFORM_WRAPPERS, ['android', 'ios', 'desktop', 'web']);

  for (const platform of SETTINGS_PLATFORM_WRAPPERS) {
    const settings = createPlatformSettings(platform, {
      language: 'en-US',
      theme: 'dark',
      notifications: { sounds: false }
    });

    assert.equal(settings.platform, platform);
    assert.equal(settings.language, 'en-US');
    assert.equal(settings.theme, 'dark');
    assert.equal(settings.notifications.sounds, false);
    assert.equal(validateTeletonSettings(settings).valid, true);
    assert.deepEqual(JSON.parse(JSON.stringify(settings)), settings);
  }

  assert.throws(() => createPlatformSettings('wearable'), /Unsupported settings platform/);
});

test('settings migration upgrades legacy payloads and rejects unsupported future schemas', () => {
  const migrated = migrateTeletonSettings({
    agentMode: 'local',
    language: 'ru',
    theme: 'light',
    notificationsEnabled: false,
    proxy: {
      enabled: true,
      activeProxyId: 'office',
      entries: [
        {
          id: 'office',
          protocol: 'socks5',
          host: '127.0.0.1',
          port: 1080,
          usernameRef: 'keychain:proxy-user',
          passwordRef: 'keychain:proxy-password'
        }
      ]
    }
  });

  assert.equal(migrated.schemaVersion, SETTINGS_SCHEMA_VERSION);
  assert.equal(migrated.agent.mode, 'local');
  assert.equal(migrated.notifications.enabled, false);
  assert.equal(migrated.proxy.enabled, true);
  assert.equal(migrated.proxy.entries[0].usernameRef, 'keychain:proxy-user');
  assert.equal(validateTeletonSettings(migrated).valid, true);

  const future = validateTeletonSettings({ schemaVersion: SETTINGS_SCHEMA_VERSION + 1 });
  assert.equal(future.valid, false);
  assert.match(future.errors.join('\n'), /newer than this client supports/);
});

test('portable settings export excludes local secrets and private agent memory fields', () => {
  const settings = createTeletonSettings({
    language: 'en-US',
    theme: 'dark',
    agent: {
      mode: 'local',
      model: { provider: 'local', modelId: 'teleton-local-small' },
      requireConfirmation: false,
      maxAutonomousActionsPerHour: 6
    },
    proxy: {
      enabled: true,
      activeProxyId: 'office',
      entries: [
        {
          id: 'office',
          protocol: 'mtproto',
          host: 'proxy.example',
          port: 443,
          secretRef: 'keychain:teleton.proxy.office'
        }
      ]
    },
    security: {
      requireDeviceLock: true,
      lockAfterMinutes: 10,
      agentMemoryKeyRef: 'keychain:teleton.agentMemory.desktop.v1',
      secretRefs: {
        cloudAgentToken: 'keychain:teleton.agent.cloud',
        telegramApiHash: 'env:TELEGRAM_API_HASH'
      }
    }
  });

  const exported = exportPortableTeletonSettings(settings);
  const serialized = JSON.stringify(exported);

  assert.equal(exported.kind, 'teleton.settings.export');
  assert.equal(exported.schemaVersion, SETTINGS_SCHEMA_VERSION);
  assert.equal(exported.settings.agent.mode, 'local');
  assert.equal(exported.settings.proxy.entries[0].secretRef, undefined);
  assert.equal(exported.settings.security.agentMemoryKeyRef, undefined);
  assert.deepEqual(exported.settings.security.secretRefs, undefined);
  assert.doesNotMatch(serialized, /cloudAgentToken|telegramApiHash|keychain:|env:TELEGRAM_API_HASH/);
  assert.equal(exported.settings.agent.memory, undefined);
  assert.equal(exported.settings.security.agentMemoryKeyRef, undefined);
});

test('portable settings import validates version and previews changes before apply', () => {
  const current = createTeletonSettings({
    language: 'en-US',
    theme: 'light',
    agent: { mode: 'local', maxAutonomousActionsPerHour: 2 },
    security: {
      requireDeviceLock: true,
      lockAfterMinutes: 15,
      agentMemoryKeyRef: 'keychain:teleton.agentMemory.desktop.v1',
      secretRefs: { cloudAgentToken: 'keychain:teleton.agent.cloud' }
    }
  });
  const exported = exportPortableTeletonSettings({
    ...current,
    language: 'ru',
    theme: 'dark',
    agent: { mode: 'local', maxAutonomousActionsPerHour: 8 },
    security: { ...current.security, lockAfterMinutes: 30 }
  });

  const preview = previewPortableTeletonSettingsImport(exported, { currentSettings: current });

  assert.equal(preview.valid, true);
  assert.equal(preview.schemaVersion, SETTINGS_SCHEMA_VERSION);
  assert.deepEqual(preview.excludedFields, [
    'proxy.entries[].secretRef',
    'proxy.entries[].usernameRef',
    'proxy.entries[].passwordRef',
    'security.agentMemoryKeyRef',
    'security.secretRefs',
    'agent.memory'
  ]);
  assert.deepEqual(preview.changes.map((change) => change.path), [
    'language',
    'theme',
    'agent.maxAutonomousActionsPerHour',
    'security.lockAfterMinutes'
  ]);
  assert.equal(preview.settings.security.agentMemoryKeyRef, 'keychain:teleton.agentMemory.desktop.v1');
  assert.deepEqual(preview.settings.security.secretRefs, { cloudAgentToken: 'keychain:teleton.agent.cloud' });

  const imported = importPortableTeletonSettings(exported, { currentSettings: current });
  assert.equal(imported.language, 'ru');
  assert.equal(imported.security.agentMemoryKeyRef, 'keychain:teleton.agentMemory.desktop.v1');

  const malformed = previewPortableTeletonSettingsImport({ schemaVersion: SETTINGS_SCHEMA_VERSION, settings: 'bad' });
  assert.equal(malformed.valid, false);
  assert.match(malformed.errors.join('\n'), /settings must be an object/);

  const future = previewPortableTeletonSettingsImport({
    kind: 'teleton.settings.export',
    schemaVersion: SETTINGS_SCHEMA_VERSION + 1,
    settings: {}
  });
  assert.equal(future.valid, false);
  assert.match(future.errors.join('\n'), /newer than this client supports/);
});
