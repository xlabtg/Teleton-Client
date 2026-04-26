import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AGENT_ACTION_NOTIFICATION_TYPES,
  createAgentActionNotification,
  createAgentActionNotificationDispatcher,
  notifyAgentActionEvent
} from '../src/foundation/agent-action-notifications.mjs';
import { createAgentIpcEnvelope } from '../src/foundation/agent-ipc-bridge.mjs';

test('agent action notification types classify lifecycle priority levels', () => {
  assert.deepEqual(AGENT_ACTION_NOTIFICATION_TYPES, [
    'agent.action.proposed',
    'agent.action.started',
    'agent.action.completed',
    'agent.action.approvalRequired',
    'agent.action.failed'
  ]);

  const notification = createAgentActionNotification({
    type: 'agent.action.approvalRequired',
    action: 'sendMessage',
    actionLabel: 'Send message',
    timestamp: '2026-04-26T10:00:00.000Z',
    payload: {
      chatTitle: 'Private chat',
      messageText: 'meet at the private address'
    }
  });

  assert.equal(notification.priority, 'critical');
  assert.equal(notification.visible, true);
  assert.equal(notification.requiresUserAction, true);
  assert.equal(notification.title, 'Agent action needs approval');
  assert.equal(notification.body, 'Review Send message before Teleton Agent continues.');
  assert.equal(notification.lockScreenBody, 'Review an agent action before Teleton Agent continues.');
  assert.equal(notification.payload.action, 'sendMessage');
  assert.equal(notification.payload.messageText, undefined);
  assert.doesNotMatch(JSON.stringify(notification), /private address|Private chat/);
});

test('informational agent action notifications respect user notification settings', () => {
  const event = createAgentIpcEnvelope({
    id: 'event-1',
    kind: 'event',
    source: 'agent',
    target: 'ui',
    eventType: 'agent.task.updated',
    timestamp: '2026-04-26T10:00:01.000Z',
    payload: {
      action: 'summarizeChat',
      actionLabel: 'Summarize chat',
      state: 'started',
      messageText: 'sensitive customer message'
    }
  });

  assert.equal(
    notifyAgentActionEvent(event, {
      settings: { notifications: { enabled: false } }
    }),
    null
  );

  assert.equal(
    notifyAgentActionEvent(event, {
      settings: { notifications: { enabled: true, mentionsOnly: true } }
    }),
    null
  );
});

test('dispatcher sends approval-required and background notifications to UI and platform channels', () => {
  const uiNotifications = [];
  const platformNotifications = [];
  const dispatcher = createAgentActionNotificationDispatcher({
    settings: { notifications: { enabled: false } },
    notifyUi: (notification) => uiNotifications.push(notification),
    notifyPlatform: (notification) => platformNotifications.push(notification)
  });

  const approval = dispatcher.handleAgentEvent(
    createAgentIpcEnvelope({
      id: 'event-approval',
      kind: 'event',
      source: 'agent',
      target: 'ui',
      eventType: 'agent.action.proposed',
      timestamp: '2026-04-26T10:00:02.000Z',
      payload: {
        action: 'deleteMessage',
        actionLabel: 'Delete message',
        requiresApproval: true,
        messageText: 'delete this private message'
      }
    })
  );

  assert.equal(approval.type, 'agent.action.approvalRequired');
  assert.equal(uiNotifications.length, 1);
  assert.equal(platformNotifications.length, 1);
  assert.equal(platformNotifications[0].visible, true);
  assert.doesNotMatch(JSON.stringify(platformNotifications[0]), /private message/);

  const mutedInfo = dispatcher.handleAgentEvent(
    createAgentIpcEnvelope({
      id: 'event-info',
      kind: 'event',
      source: 'agent',
      target: 'ui',
      eventType: 'agent.task.updated',
      timestamp: '2026-04-26T10:00:03.000Z',
      payload: {
        action: 'summarizeChat',
        actionLabel: 'Summarize chat',
        state: 'completed'
      }
    })
  );

  assert.equal(mutedInfo, null);
  assert.equal(uiNotifications.length, 1);
  assert.equal(platformNotifications.length, 1);
});
