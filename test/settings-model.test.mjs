import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  SETTINGS_PLATFORM_WRAPPERS,
  SETTINGS_SCHEMA_VERSION,
  TELETON_SETTINGS_SCHEMA,
  createPlatformSettings,
  createTeletonSettings,
  migrateTeletonSettings,
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

test('settings validation enforces agent provider secrets and cloud opt-in', () => {
  const invalid = validateTeletonSettings({
    agent: {
      mode: 'local',
      allowCloudProcessing: false,
      providerConfig: {
        id: 'custom-provider',
        type: 'custom-endpoint',
        modelId: 'vendor/model',
        endpointUrl: 'https://llm.example.test/v1',
        apiKeyRef: 'env:TELETON_CUSTOM_LLM_KEY'
      }
    }
  });

  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join('\n'), /explicit user opt-in/);

  const rawCredential = validateTeletonSettings({
    agent: {
      mode: 'cloud',
      allowCloudProcessing: true,
      providerConfig: {
        id: 'custom-provider',
        type: 'custom-endpoint',
        modelId: 'vendor/model',
        endpointUrl: 'https://llm.example.test/v1',
        apiKeyRef: 'raw-api-key'
      }
    }
  });

  assert.equal(rawCredential.valid, false);
  assert.match(rawCredential.errors.join('\n'), /secure references/);

  const valid = validateTeletonSettings({
    agent: {
      mode: 'cloud',
      allowCloudProcessing: true,
      providerConfig: {
        id: 'teleton-cloud',
        type: 'cloud',
        modelId: 'teleton-cloud-default',
        endpointUrl: 'https://agent.teleton.example/v1',
        tokenRef: 'keychain:teleton-agent-token'
      }
    }
  });

  assert.equal(valid.valid, true);
  assert.equal(valid.settings.agent.providerConfig.tokenRef, 'keychain:teleton-agent-token');
  assert.equal(valid.settings.agent.providerConfig.requiresCloudOptIn, true);
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
