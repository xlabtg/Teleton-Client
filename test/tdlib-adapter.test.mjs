import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  TDLIB_PLATFORMS,
  createMockTdlibClientAdapter,
  createTdlibClientAdapter,
  validateTdlibAuthenticationRequest
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
