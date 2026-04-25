import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  TDLIB_PLATFORMS,
  createMockTdlibClientAdapter,
  createTdlibClientAdapter,
  validateTdlibAuthenticationRequest,
  validateTdlibProxyConfig
} from '../src/tdlib/client-adapter.mjs';

const root = new URL('../', import.meta.url);

function pathFor(relativePath) {
  return new URL(relativePath, root);
}

test('TDLib adapter contract declares supported platform callers', () => {
  assert.deepEqual(TDLIB_PLATFORMS, ['android', 'ios', 'desktop', 'web']);

  const adapter = createMockTdlibClientAdapter({ platform: 'web' });

  assert.equal(adapter.platform, 'web');
  assert.equal(typeof adapter.authenticate, 'function');
  assert.equal(typeof adapter.getChatList, 'function');
  assert.equal(typeof adapter.sendMessage, 'function');
  assert.equal(typeof adapter.subscribeUpdates, 'function');
});

test('TDLib authentication rejects raw Telegram credentials and accepts secure references', async () => {
  const invalid = validateTdlibAuthenticationRequest({
    apiId: 12345,
    apiHash: 'not-a-reference',
    phoneNumber: '+15551234567'
  });

  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join('\n'), /apiIdRef/);
  assert.match(invalid.errors.join('\n'), /apiHashRef/);
  assert.match(invalid.errors.join('\n'), /phoneNumberRef/);

  const adapter = createMockTdlibClientAdapter();

  await assert.rejects(
    () => adapter.authenticate({ apiId: 12345, apiHash: 'not-a-reference' }),
    /secure reference/
  );

  const session = await adapter.authenticate({
    apiIdRef: 'env:TELEGRAM_API_ID',
    apiHashRef: 'keychain:telegram-api-hash',
    phoneNumberRef: 'keystore:telegram-phone'
  });

  assert.equal(session.authorizationState, 'ready');
  assert.deepEqual(adapter.getCommands().at(-1), {
    method: 'authenticate',
    request: {
      apiIdRef: 'env:TELEGRAM_API_ID',
      apiHashRef: 'keychain:telegram-api-hash',
      phoneNumberRef: 'keystore:telegram-phone'
    }
  });
});

test('mock TDLib adapter covers chat list, message send, and update subscription without live credentials', async () => {
  const adapter = createMockTdlibClientAdapter({
    chats: [
      { id: 'chat-1', title: 'General', unreadCount: 2 },
      { id: 'chat-2', title: 'Support', unreadCount: 0 }
    ]
  });
  const updates = [];
  const unsubscribe = adapter.subscribeUpdates((update) => updates.push(update), { types: ['message'] });

  const chatList = await adapter.getChatList({ limit: 1 });
  assert.deepEqual(chatList, {
    chats: [{ id: 'chat-1', title: 'General', unreadCount: 2 }],
    nextCursor: { offset: 1 }
  });

  const sent = await adapter.sendMessage({ chatId: 'chat-1', text: 'Hello from the mock adapter' });

  assert.equal(sent.chatId, 'chat-1');
  assert.equal(sent.text, 'Hello from the mock adapter');
  assert.equal(sent.status, 'sent');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].type, 'message');
  assert.equal(updates[0].message.id, sent.id);

  unsubscribe();
  await adapter.sendMessage({ chatId: 'chat-1', text: 'No subscriber should receive this' });
  assert.equal(updates.length, 1);
});

test('TDLib client adapter validates bridge inputs before native calls', async () => {
  const calls = [];
  const adapter = createTdlibClientAdapter(
    {
      async authenticate(request) {
        calls.push({ method: 'authenticate', request });
        return { authorizationState: 'wait_code' };
      },
      async getChatList(query) {
        calls.push({ method: 'getChatList', query });
        return { chats: [], nextCursor: null };
      },
      async sendMessage(draft) {
        calls.push({ method: 'sendMessage', draft });
        return { id: 'native-message-1', ...draft, status: 'pending' };
      },
      subscribeUpdates(listener) {
        calls.push({ method: 'subscribeUpdates' });
        listener({ type: 'connectionState', state: 'ready' });
        return () => calls.push({ method: 'unsubscribe' });
      }
    },
    { platform: 'android' }
  );

  assert.equal(adapter.platform, 'android');
  await assert.rejects(() => adapter.getChatList({ limit: 0 }), /Chat list limit/);
  await assert.rejects(() => adapter.sendMessage({ chatId: 'chat-1', text: '' }), /Message text/);

  await adapter.getChatList({ limit: 10 });
  await adapter.sendMessage({ chatId: 'chat-1', text: 'Validated message' });
  const unsubscribe = adapter.subscribeUpdates(() => {}, { types: ['connectionState'] });
  unsubscribe();

  assert.deepEqual(calls, [
    { method: 'getChatList', query: { limit: 10, cursor: null } },
    { method: 'sendMessage', draft: { chatId: 'chat-1', text: 'Validated message' } },
    { method: 'subscribeUpdates' },
    { method: 'unsubscribe' }
  ]);
});

test('TDLib proxy commands map MTProto and SOCKS5 settings without plaintext secrets', async () => {
  const adapter = createMockTdlibClientAdapter();

  const mtproto = await adapter.enableProxy({
    protocol: 'mtproto',
    host: 'mtproto.example',
    port: 443,
    secretRef: 'env:TELETON_MTPROTO_SECRET'
  });
  const socks5 = await adapter.updateProxy(mtproto.proxyId, {
    protocol: 'socks5',
    host: '127.0.0.1',
    port: 1080,
    usernameRef: 'keychain:proxy-user',
    passwordRef: 'keychain:proxy-password'
  });

  await adapter.disableProxy();
  await adapter.removeProxy(socks5.proxyId);

  assert.deepEqual(adapter.getCommands().slice(-4), [
    {
      method: 'enableProxy',
      command: {
        '@type': 'addProxy',
        server: 'mtproto.example',
        port: 443,
        enable: true,
        type: {
          '@type': 'proxyTypeMtproto',
          secretRef: 'env:TELETON_MTPROTO_SECRET'
        }
      }
    },
    {
      method: 'updateProxy',
      proxyId: mtproto.proxyId,
      command: {
        '@type': 'editProxy',
        proxy_id: mtproto.proxyId,
        server: '127.0.0.1',
        port: 1080,
        enable: true,
        type: {
          '@type': 'proxyTypeSocks5',
          usernameRef: 'keychain:proxy-user',
          passwordRef: 'keychain:proxy-password'
        }
      }
    },
    {
      method: 'disableProxy',
      command: {
        '@type': 'disableProxy'
      }
    },
    {
      method: 'removeProxy',
      proxyId: socks5.proxyId,
      command: {
        '@type': 'removeProxy',
        proxy_id: socks5.proxyId
      }
    }
  ]);

  assert.doesNotMatch(JSON.stringify(adapter.getCommands()), /hardcoded-secret|proxy-password-value/);
});

test('TDLib proxy validation rejects invalid settings before native calls', async () => {
  const validation = validateTdlibProxyConfig({
    protocol: 'mtproto',
    host: 'proxy.example',
    port: 443,
    secret: 'hardcoded-secret'
  });

  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /secure reference/);

  const calls = [];
  const adapter = createTdlibClientAdapter(
    {
      async authenticate() {
        return { authorizationState: 'ready' };
      },
      async getChatList() {
        return { chats: [], nextCursor: null };
      },
      async sendMessage() {
        return { id: 'message-1', status: 'sent' };
      },
      subscribeUpdates() {
        return () => {};
      },
      async enableProxy(command) {
        calls.push(command);
        return { proxyId: 1 };
      }
    }
  );

  await assert.rejects(
    () => adapter.enableProxy({
      protocol: 'socks5',
      host: '',
      port: 70000,
      password: 'raw-password'
    }),
    /Proxy host/
  );

  assert.deepEqual(calls, []);
});

test('TDLib adapter logs structured network failures with redacted user content', async () => {
  const logs = [];
  const adapter = createTdlibClientAdapter(
    {
      async authenticate() {
        return { authorizationState: 'ready' };
      },
      async getChatList() {
        return { chats: [], nextCursor: null };
      },
      async sendMessage() {
        throw new Error('network timeout for +1 555 123 4567 token 123456:abcdefghijklmnopqrstuvwxyzABCDEF');
      },
      subscribeUpdates() {
        return () => {};
      },
      async enableProxy() {
        throw new Error('connect ECONNREFUSED env:TELETON_MTPROTO_SECRET');
      }
    },
    { logger: (entry) => logs.push(entry) }
  );

  await assert.rejects(
    () => adapter.sendMessage({ chatId: 'chat-1', text: 'private message body' }),
    /network timeout/
  );
  await assert.rejects(
    () => adapter.enableProxy({
      protocol: 'mtproto',
      host: 'mtproto.example',
      port: 443,
      secretRef: 'env:TELETON_MTPROTO_SECRET'
    }),
    /ECONNREFUSED/
  );

  assert.equal(logs.length, 2);
  assert.equal(logs[0].event, 'network.error');
  assert.equal(logs[0].category, 'network_operation_failed');
  assert.equal(logs[1].category, 'mtproto_proxy_failed');
  assert.equal(logs[1].host, 'mtproto.example');
  assert.doesNotMatch(
    JSON.stringify(logs),
    /private message body|\+1 555 123 4567|123456:abcdefghijklmnopqrstuvwxyzABCDEF|TELETON_MTPROTO_SECRET/
  );
});

test('TDLib build targets, licensing, and adapter boundary are documented', async () => {
  const buildGuide = await readFile(pathFor('BUILD-GUIDE.md'), 'utf8');
  const adapterGuide = await readFile(pathFor('docs/tdlib-adapter.md'), 'utf8');

  assert.match(buildGuide, /TDLib Build Targets/);
  assert.match(adapterGuide, /Android/);
  assert.match(adapterGuide, /iOS/);
  assert.match(adapterGuide, /desktop/);
  assert.match(adapterGuide, /web-compatible/);
  assert.match(adapterGuide, /Boost Software License/);
  assert.match(adapterGuide, /apiIdRef/);
  assert.match(adapterGuide, /apiHashRef/);
});
