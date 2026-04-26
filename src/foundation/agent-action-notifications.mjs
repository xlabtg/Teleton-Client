export const AGENT_ACTION_NOTIFICATION_TYPES = Object.freeze([
  'agent.action.proposed',
  'agent.action.started',
  'agent.action.completed',
  'agent.action.approvalRequired',
  'agent.action.failed'
]);

const TYPE_METADATA = Object.freeze({
  'agent.action.proposed': Object.freeze({
    priority: 'high',
    title: 'Agent action proposed',
    body: (label) => `Review ${label} before Teleton Agent continues.`,
    lockScreenBody: 'Review an agent action before Teleton Agent continues.',
    requiresUserAction: true
  }),
  'agent.action.started': Object.freeze({
    priority: 'normal',
    title: 'Agent action started',
    body: (label) => `Teleton Agent started ${label}.`,
    lockScreenBody: 'Teleton Agent started an action.',
    requiresUserAction: false
  }),
  'agent.action.completed': Object.freeze({
    priority: 'normal',
    title: 'Agent action completed',
    body: (label) => `Teleton Agent completed ${label}.`,
    lockScreenBody: 'Teleton Agent completed an action.',
    requiresUserAction: false
  }),
  'agent.action.approvalRequired': Object.freeze({
    priority: 'critical',
    title: 'Agent action needs approval',
    body: (label) => `Review ${label} before Teleton Agent continues.`,
    lockScreenBody: 'Review an agent action before Teleton Agent continues.',
    requiresUserAction: true
  }),
  'agent.action.failed': Object.freeze({
    priority: 'high',
    title: 'Agent action failed',
    body: (label) => `Teleton Agent could not complete ${label}.`,
    lockScreenBody: 'Teleton Agent could not complete an action.',
    requiresUserAction: false
  })
});

const PRIVATE_PAYLOAD_FIELDS = new Set([
  'message',
  'messageText',
  'text',
  'content',
  'body',
  'chatTitle',
  'chatName',
  'senderName',
  'recipientName',
  'prompt',
  'context'
]);

function clone(value) {
  return structuredClone(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeNotificationType(value) {
  const type = String(value ?? '').trim();

  if (!AGENT_ACTION_NOTIFICATION_TYPES.includes(type)) {
    throw new Error(`Unsupported agent action notification type: ${value}`);
  }

  return type;
}

function normalizeLabel(value, fallback) {
  const label = String(value ?? '').trim();
  return label || fallback;
}

function normalizeTimestamp(value) {
  if (value === undefined) {
    return new Date().toISOString();
  }

  const timestamp = String(value).trim();
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) {
    throw new Error('Agent action notification timestamp must be an ISO-compatible date string.');
  }

  return timestamp;
}

function redactPayload(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  const redacted = {};

  for (const [key, fieldValue] of Object.entries(value)) {
    if (PRIVATE_PAYLOAD_FIELDS.has(key)) {
      continue;
    }

    if (isPlainObject(fieldValue)) {
      redacted[key] = redactPayload(fieldValue);
    } else if (Array.isArray(fieldValue)) {
      redacted[key] = fieldValue.map((item) => (isPlainObject(item) ? redactPayload(item) : item));
    } else {
      redacted[key] = fieldValue;
    }
  }

  return redacted;
}

function notificationTypeForEvent(event) {
  if (event.eventType === 'agent.action.proposed') {
    return event.payload?.requiresApproval === false ? 'agent.action.proposed' : 'agent.action.approvalRequired';
  }

  if (event.eventType === 'agent.action.started') {
    return 'agent.action.started';
  }

  if (event.eventType === 'agent.action.completed') {
    return 'agent.action.completed';
  }

  if (event.eventType === 'agent.task.updated') {
    if (event.payload?.state === 'started') {
      return 'agent.action.started';
    }

    if (event.payload?.state === 'completed') {
      return 'agent.action.completed';
    }

    if (event.payload?.state === 'failed') {
      return 'agent.action.failed';
    }
  }

  return null;
}

function shouldDeliver(notification, settings = {}) {
  if (notification.requiresUserAction || notification.priority === 'critical') {
    return true;
  }

  const notificationSettings = settings.notifications ?? {};
  if (notificationSettings.enabled === false) {
    return false;
  }

  if (notificationSettings.mentionsOnly === true) {
    return false;
  }

  return true;
}

export function createAgentActionNotification(input = {}) {
  if (!isPlainObject(input)) {
    throw new Error('Agent action notification input must be an object.');
  }

  const type = normalizeNotificationType(input.type);
  const metadata = TYPE_METADATA[type];
  const action = String(input.action ?? input.payload?.action ?? 'agentAction').trim() || 'agentAction';
  const actionLabel = normalizeLabel(input.actionLabel ?? input.payload?.actionLabel, action);

  return Object.freeze({
    id: String(input.id ?? `${type}.${Date.now()}`),
    type,
    priority: metadata.priority,
    visible: true,
    requiresUserAction: metadata.requiresUserAction,
    title: metadata.title,
    body: metadata.body(actionLabel),
    lockScreenBody: metadata.lockScreenBody,
    timestamp: normalizeTimestamp(input.timestamp),
    payload: Object.freeze({
      ...redactPayload(input.payload),
      action,
      actionLabel
    })
  });
}

export function notifyAgentActionEvent(event, options = {}) {
  if (!isPlainObject(event) || event.kind !== 'event') {
    throw new Error('Agent action notification requires an IPC event envelope.');
  }

  const type = notificationTypeForEvent(event);
  if (type === null) {
    return null;
  }

  const notification = createAgentActionNotification({
    id: event.id,
    type,
    action: event.payload?.action,
    actionLabel: event.payload?.actionLabel,
    payload: event.payload,
    timestamp: event.timestamp
  });

  if (!shouldDeliver(notification, options.settings)) {
    return null;
  }

  options.notifyUi?.(clone(notification));
  options.notifyPlatform?.(clone(notification));

  return notification;
}

export function createAgentActionNotificationDispatcher(options = {}) {
  return Object.freeze({
    handleAgentEvent(event) {
      return notifyAgentActionEvent(event, options);
    }
  });
}
