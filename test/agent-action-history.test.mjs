import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AGENT_ACTION_HISTORY_RETENTION_DAYS,
  createAgentActionHistoryStore,
  createAgentActionRecord,
  createRollbackMetadata
} from '../src/foundation/agent-action-history.mjs';
import { createAgentIpcEnvelope } from '../src/foundation/agent-ipc-bridge.mjs';

test('agent action history records status, actor, timestamp, and redacted payloads', () => {
  const record = createAgentActionRecord({
    id: 'action-1',
    action: 'sendMessage',
    actionLabel: 'Send message',
    actor: { id: 'agent.local', type: 'agent', displayName: 'Teleton Agent' },
    status: 'completed',
    timestamp: '2026-04-26T10:00:00.000Z',
    completedAt: '2026-04-26T10:00:05.000Z',
    payload: {
      chatId: 42,
      messageText: 'private body',
      chatTitle: 'Private chat',
      nested: { prompt: 'secret prompt', route: 'local' }
    }
  });

  assert.equal(record.id, 'action-1');
  assert.equal(record.status, 'completed');
  assert.equal(record.actor.id, 'agent.local');
  assert.equal(record.timestamp, '2026-04-26T10:00:00.000Z');
  assert.equal(record.completedAt, '2026-04-26T10:00:05.000Z');
  assert.equal(record.payload.chatId, 42);
  assert.equal(record.payload.nested.route, 'local');
  assert.doesNotMatch(JSON.stringify(record), /private body|Private chat|secret prompt/);
});

test('agent action history filters records by retention and exposes rollback eligibility', () => {
  const store = createAgentActionHistoryStore({
    now: () => '2026-04-26T12:00:00.000Z',
    retentionDays: 7
  });

  store.recordAction({
    id: 'old-action',
    action: 'sendMessage',
    actor: { id: 'agent.local', type: 'agent' },
    status: 'completed',
    timestamp: '2026-04-01T12:00:00.000Z',
    rollback: createRollbackMetadata({
      type: 'compensating-action',
      action: 'deleteMessage',
      expiresAt: '2026-04-08T12:00:00.000Z'
    })
  });

  const reversible = store.recordAction({
    id: 'recent-action',
    action: 'sendMessage',
    actor: { id: 'agent.local', type: 'agent' },
    status: 'completed',
    timestamp: '2026-04-26T11:00:00.000Z',
    rollback: {
      type: 'compensating-action',
      action: 'deleteMessage',
      actionLabel: 'Delete sent message',
      expiresAt: '2026-04-27T11:00:00.000Z',
      payload: { messageId: 99, messageText: 'private rollback body' }
    }
  });

  assert.equal(AGENT_ACTION_HISTORY_RETENTION_DAYS, 30);
  assert.equal(reversible.rollback.eligible, true);
  assert.equal(reversible.rollback.action, 'deleteMessage');
  assert.equal(reversible.rollback.payload.messageId, 99);
  assert.doesNotMatch(JSON.stringify(reversible.rollback), /private rollback body/);

  assert.deepEqual(store.listRecords().map((record) => record.id), ['recent-action']);
  assert.deepEqual(store.listRecords({ rollbackEligible: true }).map((record) => record.id), ['recent-action']);

  const rollbackRequest = store.createRollbackRequest('recent-action', { requestedBy: 'user:42' });
  assert.equal(rollbackRequest.action, 'deleteMessage');
  assert.equal(rollbackRequest.payload.rollbackOf, 'recent-action');
  assert.equal(rollbackRequest.payload.requestedBy, 'user:42');
});

test('irreversible agent actions are clearly marked before execution', () => {
  const proposed = createAgentIpcEnvelope({
    id: 'proposal-1',
    kind: 'event',
    source: 'agent',
    target: 'ui',
    eventType: 'agent.action.proposed',
    timestamp: '2026-04-26T12:00:00.000Z',
    payload: {
      action: 'deleteMessage',
      actionLabel: 'Delete message',
      reversibility: 'irreversible',
      irreversibleReason: 'Telegram does not expose message restore after deletion.',
      messageText: 'private text'
    }
  });

  const store = createAgentActionHistoryStore({ now: () => '2026-04-26T12:00:01.000Z' });
  const marker = store.previewAction(proposed);

  assert.equal(marker.id, 'proposal-1');
  assert.equal(marker.status, 'proposed');
  assert.equal(marker.rollback.eligible, false);
  assert.equal(marker.rollback.reason, 'Telegram does not expose message restore after deletion.');
  assert.equal(marker.requiresIrreversibleConfirmation, true);
  assert.match(marker.warning, /cannot be rolled back/i);
  assert.doesNotMatch(JSON.stringify(marker), /private text/);
});

test('expired rollback metadata is retained as ineligible until action history retention removes the record', () => {
  const store = createAgentActionHistoryStore({ now: () => '2026-04-26T12:00:00.000Z' });
  const record = store.recordAction({
    id: 'expired-rollback',
    action: 'editMessage',
    actor: { id: 'agent.local', type: 'agent' },
    status: 'completed',
    timestamp: '2026-04-26T10:00:00.000Z',
    rollback: {
      type: 'direct',
      action: 'restoreMessage',
      expiresAt: '2026-04-26T11:00:00.000Z'
    }
  });

  assert.equal(record.rollback.eligible, false);
  assert.equal(record.rollback.reason, 'Rollback window expired.');
  assert.throws(() => store.createRollbackRequest('expired-rollback'), /not rollback eligible/);
});
