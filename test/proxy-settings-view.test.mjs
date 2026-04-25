import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createProxySettingsView } from '../src/foundation/proxy-settings-view.mjs';

test('proxy settings view supports add, test, enable, disable, and remove workflow', async () => {
  const view = createProxySettingsView({
    testProxy: async (proxy) => ({
      reachable: proxy.host === 'proxy.example',
      message: proxy.host === 'proxy.example' ? 'Connected' : `Could not connect with env:SECRET_VALUE`
    })
  });

  assert.deepEqual(view.getState().list.items, []);
  assert.equal(view.getState().route.type, 'direct');

  let state = view.updateDraft({
    id: 'primary',
    protocol: 'mtproto',
    host: 'proxy.example',
    port: '443',
    secretRef: 'env:TELETON_MTPROTO_SECRET'
  });
  assert.equal(state.form.valid, true);

  state = view.saveDraft();
  assert.equal(state.list.items.length, 1);
  assert.equal(state.list.items[0].label, 'MTProto proxy.example:443');
  assert.equal(state.list.items[0].secretConfigured, true);
  assert.equal(state.list.items[0].secretRef, undefined);

  state = await view.testProxy('primary');
  assert.equal(state.tests.primary.status, 'success');
  assert.equal(state.tests.primary.message, 'Connected');

  state = view.enableProxy('primary');
  assert.equal(state.route.type, 'mtproto');
  assert.equal(state.route.proxyId, 'primary');
  assert.equal(state.preferences.autoSwitchEnabled, true);

  state = view.setAutoSwitchEnabled(false);
  assert.equal(state.preferences.autoSwitchEnabled, false);
  assert.equal(state.route.proxyId, 'primary');

  state = view.disableProxy();
  assert.equal(state.route.type, 'direct');
  assert.equal(state.list.items[0].enabled, false);

  state = view.removeProxy('primary');
  assert.deepEqual(state.list.items, []);
  assert.equal(state.route.type, 'direct');
});

test('proxy settings view reports validation and test failures without exposing secrets', async () => {
  const view = createProxySettingsView({
    initialSettings: {
      proxy: {
        enabled: true,
        activeProxyId: 'office',
        entries: [
          {
            id: 'office',
            protocol: 'socks5',
            host: '10.0.0.5',
            port: 1080,
            usernameRef: 'keychain:proxy-user',
            passwordRef: 'keychain:proxy-password'
          }
        ]
      }
    },
    testProxy: async () => {
      throw new Error('Authentication failed for keychain:proxy-password');
    }
  });

  assert.equal(view.getState().route.type, 'socks5');
  assert.equal(view.getState().list.items[0].usernameConfigured, true);
  assert.equal(view.getState().list.items[0].passwordRef, undefined);

  const invalid = view.updateDraft({
    id: 'bad',
    protocol: 'mtproto',
    host: 'mtproxy.example',
    port: '443',
    secretRef: 'raw-secret'
  });
  assert.equal(invalid.form.valid, false);
  assert.match(invalid.form.errors.join('\n'), /secure reference/);
  assert.throws(() => view.saveDraft(), /secure reference/);

  const tested = await view.testProxy('office');
  assert.equal(tested.tests.office.status, 'failure');
  assert.equal(tested.tests.office.message, 'Authentication failed for [redacted]');
  assert.doesNotMatch(JSON.stringify(tested), /keychain:proxy-password/);
});

test('proxy settings view exposes safe connection quality indicator states', () => {
  const view = createProxySettingsView({
    initialSettings: {
      proxy: {
        enabled: true,
        activeProxyId: 'office',
        entries: [
          {
            id: 'office',
            protocol: 'socks5',
            host: '10.0.0.5',
            port: 1080,
            usernameRef: 'keychain:proxy-user',
            passwordRef: 'keychain:proxy-password'
          }
        ]
      }
    }
  });

  assert.deepEqual(view.getState().connectionQuality, {
    state: 'testing',
    route: 'testing',
    label: 'Checking connection...',
    detail: 'Testing direct and proxy routes.',
    tone: 'info',
    latencyMs: null,
    proxyId: null
  });

  let state = view.updateConnectionQuality({
    testing: false,
    direct: { reachable: true, latencyMs: 80 }
  });
  assert.equal(state.connectionQuality.state, 'direct');
  assert.equal(state.connectionQuality.route, 'direct');
  assert.equal(state.connectionQuality.label, 'Direct connection');
  assert.equal(state.connectionQuality.tone, 'success');

  state = view.updateConnectionQuality({
    testing: false,
    direct: { reachable: false },
    proxies: {
      office: { reachable: true, latencyMs: 260 }
    }
  });
  assert.equal(state.connectionQuality.state, 'proxy');
  assert.equal(state.connectionQuality.route, 'socks5');
  assert.equal(state.connectionQuality.proxyId, 'office');
  assert.equal(state.connectionQuality.label, 'SOCKS5 proxy connection');
  assert.equal(state.connectionQuality.tone, 'warning');
  assert.doesNotMatch(JSON.stringify(state.connectionQuality), /keychain:proxy-password/);

  state = view.updateConnectionQuality({
    testing: false,
    direct: { reachable: true, latencyMs: 1800 }
  });
  assert.equal(state.connectionQuality.state, 'degraded');
  assert.equal(state.connectionQuality.label, 'Degraded direct connection');
  assert.equal(state.connectionQuality.tone, 'warning');

  state = view.updateConnectionQuality({
    testing: false,
    direct: { reachable: false },
    proxies: {
      office: { reachable: false, message: 'Authentication failed for keychain:proxy-password' }
    }
  });
  assert.equal(state.connectionQuality.state, 'offline');
  assert.equal(state.connectionQuality.label, 'Offline');
  assert.equal(state.connectionQuality.detail, 'No direct or proxy route is reachable.');
  assert.doesNotMatch(JSON.stringify(state.connectionQuality), /keychain:proxy-password/);
});
