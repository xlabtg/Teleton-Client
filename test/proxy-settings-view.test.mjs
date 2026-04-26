import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createProxySettingsView } from '../src/foundation/proxy-settings-view.mjs';

test('proxy settings view supports add, test, enable, disable, and remove workflow', async () => {
  const view = createProxySettingsView({
    testProxy: async (proxy, probe) => ({
      reachable: proxy.host === 'proxy.example',
      message: proxy.host === 'proxy.example' ? 'Connected' : `Could not connect with env:SECRET_VALUE`,
      probeTarget: probe.target
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
  assert.equal(state.tests.primary.reason, null);
  assert.equal(state.tests.primary.probeTarget, 'telegram');

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

test('proxy settings view records per-proxy speed checks with timeout and failure categories', async () => {
  let now = 1_000;
  const seen = [];
  const view = createProxySettingsView({
    speedTest: {
      target: 'telegram',
      timeoutMs: 5000,
      now: () => now
    },
    testProxy: async (proxy, probe) => {
      seen.push({ proxy, probe });
      if (proxy.id === 'slow') {
        now += 5100;
        return {
          reachable: true,
          latencyMs: 80,
          message: 'Eventually connected'
        };
      }

      if (proxy.id === 'blocked') {
        now += 40;
        return {
          reachable: false,
          reason: 'tls_error',
          message: 'TLS handshake failed'
        };
      }

      now += 123;
      return {
        reachable: true,
        message: 'Connected'
      };
    }
  });

  for (const draft of [
    { id: 'fast', protocol: 'socks5', host: 'fast.proxy', port: '1080' },
    { id: 'slow', protocol: 'socks5', host: 'slow.proxy', port: '1080' },
    { id: 'blocked', protocol: 'socks5', host: 'blocked.proxy', port: '1080' }
  ]) {
    view.updateDraft(draft);
    view.saveDraft();
  }

  let state = await view.testProxy('fast');
  assert.equal(state.tests.fast.status, 'success');
  assert.equal(state.tests.fast.reachable, true);
  assert.equal(state.tests.fast.latencyMs, 123);
  assert.equal(state.tests.fast.reason, null);
  assert.equal(state.tests.fast.probeTarget, 'telegram');

  state = await view.testProxy('slow');
  assert.equal(state.tests.slow.status, 'failure');
  assert.equal(state.tests.slow.reachable, false);
  assert.equal(state.tests.slow.reason, 'timeout');
  assert.equal(state.tests.slow.latencyMs, 5100);
  assert.equal(state.tests.slow.message, 'Proxy test timed out.');

  state = await view.testProxy('blocked');
  assert.equal(state.tests.blocked.status, 'failure');
  assert.equal(state.tests.blocked.reachable, false);
  assert.equal(state.tests.blocked.reason, 'tls_error');
  assert.equal(state.tests.blocked.latencyMs, 40);

  assert.deepEqual(
    seen.map(({ probe }) => probe),
    [
      { target: 'telegram', timeoutMs: 5000 },
      { target: 'telegram', timeoutMs: 5000 },
      { target: 'telegram', timeoutMs: 5000 }
    ]
  );
});

test('proxy settings view exposes resettable and exportable proxy usage statistics', async () => {
  let now = 1_000;
  const view = createProxySettingsView({
    speedTest: {
      now: () => now
    },
    testProxy: async () => {
      now += 90;
      return {
        reachable: true,
        message: 'Connected'
      };
    }
  });

  view.updateDraft({ id: 'office', protocol: 'socks5', host: '127.0.0.1', port: '1080' });
  view.saveDraft();

  let state = await view.testProxy('office');
  assert.equal(state.statistics.records.office.attempts, 1);
  assert.equal(state.statistics.records.office.successes, 1);
  assert.equal(state.statistics.records.office.failures, 0);
  assert.equal(state.statistics.records.office.lastLatencyMs, 90);
  assert.equal(state.statistics.records.office.lastUsedAt, 1090);
  assert.deepEqual(view.exportProxyStatistics(), state.statistics);
  assert.doesNotMatch(JSON.stringify(state.statistics), /127\.0\.0\.1|keychain|env:|Connected/);

  state = view.clearProxyStatistics('office');
  assert.deepEqual(state.statistics.records, {});
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

test('proxy settings view supports HTTP CONNECT draft and safe list display', () => {
  const view = createProxySettingsView();

  let state = view.updateDraft({
    id: 'corp-http',
    protocol: 'http-connect',
    host: 'proxy.corp',
    port: '8080',
    usernameRef: 'keychain:http-user',
    passwordRef: 'keychain:http-password'
  });
  assert.equal(state.form.valid, true);

  state = view.saveDraft();
  assert.equal(state.list.items[0].label, 'HTTP CONNECT proxy.corp:8080');
  assert.equal(state.list.items[0].usernameConfigured, true);
  assert.equal(state.list.items[0].passwordConfigured, true);
  assert.equal(state.list.items[0].passwordRef, undefined);

  state = view.enableProxy('corp-http');
  assert.equal(state.route.type, 'http-connect');
  assert.equal(state.route.usernameConfigured, true);

  state = view.updateConnectionQuality({
    testing: false,
    direct: { reachable: false },
    proxies: {
      'corp-http': { reachable: true, latencyMs: 180 }
    }
  });
  assert.equal(state.connectionQuality.label, 'HTTP CONNECT proxy connection');
});
