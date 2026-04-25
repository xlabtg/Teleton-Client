import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  classifyNetworkError,
  createNetworkErrorLogEntry,
  redactNetworkLogValue
} from '../src/foundation/network-error-logger.mjs';

test('network error logger classifies direct, MTProto, and SOCKS5 failures', () => {
  assert.equal(classifyNetworkError({ protocol: 'direct' }), 'direct_connection_failed');
  assert.equal(classifyNetworkError({ route: { type: 'mtproto' } }), 'mtproto_proxy_failed');
  assert.equal(classifyNetworkError({ route: { type: 'socks5' } }), 'socks5_proxy_failed');
});

test('network error logger redacts credentials, phone numbers, tokens, and message content', () => {
  const redacted = redactNetworkLogValue({
    secretRef: 'env:TELETON_MTPROTO_SECRET',
    passwordRef: 'keychain:proxy-password',
    phoneNumber: '+1 555 123 4567',
    botToken: '123456:abcdefghijklmnopqrstuvwxyzABCDEF',
    messageText: 'hello from a private chat',
    note: 'failed dialing +44 20 7946 0958 through env:PROXY_SECRET'
  });

  assert.deepEqual(redacted, {
    secretRef: '[REDACTED]',
    passwordRef: '[REDACTED]',
    phoneNumber: '[REDACTED]',
    botToken: '[REDACTED]',
    messageText: '[REDACTED]',
    note: 'failed dialing [REDACTED] through [REDACTED]'
  });
});

test('network error log entries keep actionable route fields without leaking secrets', () => {
  const entry = createNetworkErrorLogEntry(new Error('connect ECONNREFUSED env:PROXY_SECRET'), {
    operation: 'enableProxy',
    route: {
      type: 'socks5',
      proxyId: 'socks-office',
      host: '127.0.0.1',
      port: 1080,
      usernameRef: 'keychain:proxy-user',
      passwordRef: 'keychain:proxy-password'
    },
    messageText: 'do not log this'
  });

  assert.equal(entry.event, 'network.error');
  assert.equal(entry.category, 'socks5_proxy_failed');
  assert.equal(entry.host, '127.0.0.1');
  assert.equal(entry.port, 1080);
  assert.doesNotMatch(JSON.stringify(entry), /PROXY_SECRET|proxy-password|do not log this/);
});
