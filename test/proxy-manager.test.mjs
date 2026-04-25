import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createProxyManager, validateProxyPreferences } from '../src/foundation/proxy-manager.mjs';

const proxySettings = {
  enabled: true,
  autoSwitchEnabled: true,
  activeProxyId: 'mtproto-primary',
  entries: [
    {
      id: 'mtproto-primary',
      protocol: 'mtproto',
      host: 'mtproto.example',
      port: 443,
      secretRef: 'env:TELETON_MTPROTO_SECRET'
    },
    {
      id: 'socks-office',
      protocol: 'socks5',
      host: '127.0.0.1',
      port: 1080,
      usernameRef: 'keychain:proxy-user',
      passwordRef: 'keychain:proxy-password'
    }
  ]
};

test('proxy manager prefers direct connectivity when direct health is reachable', () => {
  const manager = createProxyManager({ proxy: proxySettings });

  assert.deepEqual(manager.chooseRoute({ direct: true }), {
    type: 'direct',
    proxyId: null
  });
});

test('proxy manager falls back through active MTProto and SOCKS5 proxy health', () => {
  const manager = createProxyManager({ proxy: proxySettings });

  assert.deepEqual(manager.chooseRoute({
    direct: false,
    proxies: {
      'mtproto-primary': { reachable: true },
      'socks-office': true
    }
  }), {
    type: 'mtproto',
    proxyId: 'mtproto-primary',
    host: 'mtproto.example',
    port: 443,
    secretRef: 'env:TELETON_MTPROTO_SECRET'
  });

  assert.deepEqual(manager.chooseRoute({
    direct: false,
    proxies: {
      'mtproto-primary': false,
      'socks-office': true
    }
  }), {
    type: 'socks5',
    proxyId: 'socks-office',
    host: '127.0.0.1',
    port: 1080,
    usernameRef: 'keychain:proxy-user',
    passwordRef: 'keychain:proxy-password'
  });

  assert.equal(manager.chooseRoute({ direct: false, proxies: {} }), null);
});

test('proxy manager auto-selects the lowest-latency healthy proxy with deterministic ties', () => {
  const manager = createProxyManager({ proxy: proxySettings });

  assert.equal(manager.chooseRoute({
    direct: { reachable: false },
    proxies: {
      'mtproto-primary': { healthy: true, latencyMs: 320 },
      'socks-office': { healthy: true, latencyMs: 120 }
    }
  }).proxyId, 'socks-office');

  assert.equal(manager.chooseRoute({
    direct: { reachable: false },
    proxies: {
      'mtproto-primary': { healthy: true, latencyMs: 100 },
      'socks-office': { healthy: true, latencyMs: 100 }
    }
  }).proxyId, 'mtproto-primary');
});

test('proxy manager excludes proxies during failure cooldown and falls back to direct', () => {
  const manager = createProxyManager({ proxy: proxySettings });

  manager.recordProxyFailure('mtproto-primary', { now: 1_000, cooldownMs: 10_000 });
  assert.equal(manager.chooseRoute({
    direct: { reachable: false },
    now: 5_000,
    proxies: {
      'mtproto-primary': { healthy: true, latencyMs: 40 },
      'socks-office': { healthy: true, latencyMs: 90 }
    }
  }).proxyId, 'socks-office');

  manager.recordProxyFailure('socks-office', { now: 2_000, cooldownMs: 10_000 });
  assert.deepEqual(manager.chooseRoute({
    direct: { reachable: true, latencyMs: 250 },
    now: 5_000,
    proxies: {
      'mtproto-primary': { healthy: true, latencyMs: 40 },
      'socks-office': { healthy: true, latencyMs: 90 }
    }
  }), {
    type: 'direct',
    proxyId: null
  });

  assert.equal(manager.chooseRoute({
    direct: { reachable: false },
    now: 13_000,
    proxies: {
      'mtproto-primary': { healthy: true, latencyMs: 40 },
      'socks-office': { healthy: true, latencyMs: 90 }
    }
  }).proxyId, 'mtproto-primary');
});

test('proxy manager keeps manual active proxy selection when automatic switching is disabled', () => {
  const manager = createProxyManager({
    proxy: {
      ...proxySettings,
      autoSwitchEnabled: false
    }
  });

  assert.equal(manager.chooseRoute({
    direct: { reachable: false },
    proxies: {
      'mtproto-primary': { healthy: true, latencyMs: 400 },
      'socks-office': { healthy: true, latencyMs: 40 }
    }
  }).proxyId, 'mtproto-primary');
});

test('proxy manager persists validated user proxy preferences without raw secrets', () => {
  const manager = createProxyManager();

  const saved = manager.saveProxyPreferences(proxySettings);
  assert.equal(saved.proxy.enabled, true);
  assert.equal(saved.proxy.activeProxyId, 'mtproto-primary');
  assert.equal(saved.proxy.entries[0].secretRef, 'env:TELETON_MTPROTO_SECRET');

  assert.deepEqual(manager.chooseRoute({
    directReachable: false,
    proxies: {
      'mtproto-primary': { healthy: true }
    }
  }).proxyId, 'mtproto-primary');

  const invalid = validateProxyPreferences({
    enabled: true,
    activeProxyId: 'raw',
    entries: [
      {
        id: 'raw',
        protocol: 'mtproto',
        host: 'proxy.example',
        port: 443,
        secret: 'hardcoded-secret'
      }
    ]
  });

  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join('\n'), /secure reference/);
  assert.throws(() => manager.saveProxyPreferences({
    enabled: true,
    activeProxyId: 'raw',
    entries: [
      {
        id: 'raw',
        protocol: 'mtproto',
        host: 'proxy.example',
        port: 443,
        secret: 'hardcoded-secret'
      }
    ]
  }), /secure reference/);
});
