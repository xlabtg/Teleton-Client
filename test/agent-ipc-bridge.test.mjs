import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AGENT_IPC_VERSION,
  createAgentIpcBridge,
  createAgentIpcEnvelope,
  createMockAgentIpcTransport,
  parseAgentIpcEnvelope
} from '../src/foundation/agent-ipc-bridge.mjs';

test('agent IPC envelopes are versioned and classify confirmation-required events', () => {
  const info = createAgentIpcEnvelope({
    id: 'event-1',
    kind: 'event',
    source: 'agent',
    target: 'ui',
    eventType: 'agent.info',
    payload: { message: 'synced' },
    timestamp: '2026-04-26T00:00:00.000Z'
  });

  assert.equal(info.version, AGENT_IPC_VERSION);
  assert.equal(info.requiresConfirmation, false);

  const proposal = createAgentIpcEnvelope({
    id: 'event-2',
    kind: 'event',
    source: 'agent',
    target: 'ui',
    eventType: 'agent.action.proposed',
    payload: { action: 'sendMessage', chatId: 42 },
    timestamp: '2026-04-26T00:00:01.000Z'
  });

  assert.equal(proposal.requiresConfirmation, true);
});

test('agent IPC bridge supports request, response, event, and cancellation flows', async () => {
  const events = [];
  const requests = [];
  const transport = createMockAgentIpcTransport();
  const bridge = createAgentIpcBridge({
    localId: 'ui',
    remoteId: 'agent',
    transport,
    onEvent: (event) => events.push(event),
    onRequest: (request) => requests.push(request)
  });

  const responsePromise = bridge.request('agent.task.create', { text: 'summarize chat' });
  assert.deepEqual(bridge.pendingRequestIds(), ['ui.request.1']);
  assert.equal(transport.sent[0].kind, 'request');
  assert.equal(transport.sent[0].action, 'agent.task.create');

  transport.deliver({
    id: 'agent.response.1',
    kind: 'response',
    source: 'agent',
    target: 'ui',
    replyTo: 'ui.request.1',
    payload: { taskId: 'task-1' }
  });

  const response = await responsePromise;
  assert.equal(response.payload.taskId, 'task-1');
  assert.deepEqual(bridge.pendingRequestIds(), []);

  transport.deliver({
    id: 'agent.event.1',
    kind: 'event',
    source: 'agent',
    target: 'ui',
    eventType: 'agent.action.proposed',
    payload: { action: 'sendMessage' }
  });
  assert.equal(events[0].requiresConfirmation, true);

  transport.deliver({
    id: 'agent.request.1',
    kind: 'request',
    source: 'agent',
    target: 'ui',
    action: 'ui.message.hook',
    payload: { chatId: 7 }
  });
  assert.equal(requests[0].action, 'ui.message.hook');

  await bridge.cancel('missing-request');
  assert.equal(transport.sent.at(-1).kind, 'cancel');
  assert.equal(transport.sent.at(-1).cancelId, 'missing-request');

  bridge.close();
});

test('agent IPC bridge rejects malformed messages before dispatch', () => {
  assert.throws(() => parseAgentIpcEnvelope('{'), /Malformed IPC message JSON/);
  assert.throws(
    () =>
      parseAgentIpcEnvelope({
        id: 'bad-1',
        kind: 'event',
        source: 'agent',
        target: 'ui',
        eventType: 'agent.unknown'
      }),
    /Unsupported IPC event type/
  );
  assert.throws(
    () =>
      parseAgentIpcEnvelope({
        id: 'bad-2',
        kind: 'request',
        source: 'ui',
        target: 'agent'
      }),
    /request envelopes require an action/
  );
  assert.throws(
    () =>
      parseAgentIpcEnvelope({
        version: 99,
        id: 'bad-3',
        kind: 'event',
        source: 'agent',
        target: 'ui',
        eventType: 'agent.info'
      }),
    /Unsupported IPC envelope version/
  );
});
