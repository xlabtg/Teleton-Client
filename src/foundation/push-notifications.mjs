export const PUSH_NOTIFICATION_CATEGORIES = Object.freeze(['messages', 'agentApprovals', 'wallet']);
export const PUSH_NOTIFICATION_PLATFORMS = Object.freeze(['android', 'ios', 'desktop', 'web']);
export const PUSH_NOTIFICATION_PERMISSION_STATUSES = Object.freeze([
  'granted',
  'provisional',
  'prompt',
  'denied',
  'unsupported'
]);

const CATEGORY_METADATA = deepFreeze({
  messages: {
    id: 'messages',
    defaultType: 'message.received',
    title: 'Messages',
    body: 'New message',
    lockScreenBody: 'New message',
    priority: 'normal',
    requiresUserAction: false,
    bypassesGlobalMute: false,
    route: 'messaging.open'
  },
  agentApprovals: {
    id: 'agentApprovals',
    defaultType: 'agent.action.approvalRequired',
    title: 'Agent approval required',
    body: 'Review an agent action before Teleton Agent continues.',
    lockScreenBody: 'Review an agent action before Teleton Agent continues.',
    priority: 'critical',
    requiresUserAction: true,
    bypassesGlobalMute: true,
    route: 'agent.action.review'
  },
  wallet: {
    id: 'wallet',
    defaultType: 'ton.wallet.updated',
    title: 'TON wallet',
    body: 'Wallet status updated',
    lockScreenBody: 'Wallet status updated',
    priority: 'high',
    requiresUserAction: false,
    bypassesGlobalMute: false,
    route: 'ton.wallet.open'
  }
});

export const PUSH_NOTIFICATION_CATEGORY_METADATA = CATEGORY_METADATA;

const PLATFORM_CAPABILITIES = deepFreeze({
  android: {
    platform: 'android',
    transport: 'local-or-FCM-notification',
    fallback: 'in-app-notification-center',
    permission: {
      name: 'android.permission.POST_NOTIFICATIONS',
      api: 'Android runtime permission',
      required: true,
      requiredSince: 'Android 13'
    },
    categories: {
      messages: {
        id: 'messages',
        nativeType: 'notification-channel',
        route: 'messaging.open',
        importance: 'default',
        visibility: 'private'
      },
      agentApprovals: {
        id: 'agent_actions',
        nativeType: 'notification-channel',
        route: 'agent.action.review',
        importance: 'high',
        visibility: 'private'
      },
      wallet: {
        id: 'wallet',
        nativeType: 'notification-channel',
        route: 'ton.wallet.open',
        importance: 'default',
        visibility: 'private'
      }
    }
  },
  ios: {
    platform: 'ios',
    transport: 'APNs-and-local-notification',
    fallback: 'in-app-notification-center',
    permission: {
      name: 'UNAuthorizationStatus',
      api: 'UNUserNotificationCenter',
      required: true,
      authorizationOptions: ['alert', 'badge', 'sound']
    },
    categories: {
      messages: {
        id: 'MESSAGES',
        nativeType: 'UNNotificationCategory',
        route: 'messaging.open',
        interruptionLevel: 'active'
      },
      agentApprovals: {
        id: 'AGENT_ACTION_REVIEW',
        nativeType: 'UNNotificationCategory',
        route: 'agent.action.review',
        interruptionLevel: 'time-sensitive'
      },
      wallet: {
        id: 'WALLET_STATUS',
        nativeType: 'UNNotificationCategory',
        route: 'ton.wallet.open',
        interruptionLevel: 'active'
      }
    }
  },
  desktop: {
    platform: 'desktop',
    transport: 'operating-system-notification-center',
    fallback: 'in-app-notification-center',
    permission: {
      name: 'system-notifications',
      api: 'Electron Notification',
      required: true
    },
    categories: {
      messages: {
        id: 'messages',
        nativeType: 'desktop-notification-category',
        route: 'messaging.open',
        urgency: 'normal'
      },
      agentApprovals: {
        id: 'agent_actions',
        nativeType: 'desktop-notification-category',
        route: 'agent.action.review',
        urgency: 'critical'
      },
      wallet: {
        id: 'wallet',
        nativeType: 'desktop-notification-category',
        route: 'ton.wallet.open',
        urgency: 'normal'
      }
    }
  },
  web: {
    platform: 'web',
    transport: 'Push-API-and-Notifications-API',
    fallback: 'in-app-badges-and-foreground-polling',
    serviceWorkerRequired: true,
    permission: {
      name: 'Notification.permission',
      api: 'Notifications API and Push API',
      required: true
    },
    categories: {
      messages: {
        id: 'messages',
        nativeType: 'web-notification-tag-prefix',
        route: 'messaging.open',
        requireInteraction: false
      },
      agentApprovals: {
        id: 'agent-approvals',
        nativeType: 'web-notification-tag-prefix',
        route: 'agent.action.review',
        requireInteraction: true
      },
      wallet: {
        id: 'wallet',
        nativeType: 'web-notification-tag-prefix',
        route: 'ton.wallet.open',
        requireInteraction: false
      }
    }
  }
});

const PRIORITIES = Object.freeze(['low', 'normal', 'high', 'critical']);
const PRIVATE_PUSH_NOTIFICATION_FIELDS = new Set([
  'address',
  'amountraw',
  'amountnano',
  'apihash',
  'apiid',
  'body',
  'chatname',
  'chattitle',
  'comment',
  'content',
  'context',
  'mnemonic',
  'message',
  'messagetext',
  'passphrase',
  'preview',
  'privatekey',
  'prompt',
  'recipientaddress',
  'recipientname',
  'seedphrase',
  'secret',
  'senderaddress',
  'sendername',
  'text',
  'title',
  'token',
  'value',
  'walletaddress'
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

function clone(value) {
  return structuredClone(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeFieldName(value) {
  return String(value ?? '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase();
}

function normalizeCategoryAlias(value) {
  return normalizeFieldName(value);
}

function inferCategoryFromType(type) {
  const notificationType = String(type ?? '').trim();

  if (notificationType.startsWith('agent.action') || notificationType.startsWith('agent.approval')) {
    return 'agentApprovals';
  }

  if (notificationType.startsWith('ton.') || notificationType.startsWith('wallet.')) {
    return 'wallet';
  }

  return 'messages';
}

export function normalizePushNotificationCategory(value, type) {
  if (value === undefined || value === null || value === '') {
    return inferCategoryFromType(type);
  }

  const alias = normalizeCategoryAlias(value);
  const aliases = {
    message: 'messages',
    messages: 'messages',
    agentapproval: 'agentApprovals',
    agentapprovals: 'agentApprovals',
    agentaction: 'agentApprovals',
    agentactions: 'agentApprovals',
    wallet: 'wallet',
    wallets: 'wallet',
    ton: 'wallet'
  };
  const category = aliases[alias];

  if (!category || !PUSH_NOTIFICATION_CATEGORIES.includes(category)) {
    throw new Error(`Unsupported push notification category: ${value}`);
  }

  return category;
}

function normalizePlatform(value) {
  const platform = String(value ?? '').trim().toLowerCase();

  if (!PUSH_NOTIFICATION_PLATFORMS.includes(platform)) {
    throw new Error(`Unsupported push notification platform: ${value}`);
  }

  return platform;
}

function normalizePriority(value, fallback) {
  const priority = String(value ?? fallback).trim().toLowerCase();

  if (!PRIORITIES.includes(priority)) {
    throw new Error(`Unsupported push notification priority: ${value}`);
  }

  return priority;
}

function normalizeTimestamp(value) {
  const timestamp = value === undefined ? new Date().toISOString() : value;
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Push notification timestamp must be an ISO-compatible date string.');
  }

  return date.toISOString();
}

function redactPushNotificationPayload(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  const redacted = {};

  for (const [key, fieldValue] of Object.entries(value)) {
    if (PRIVATE_PUSH_NOTIFICATION_FIELDS.has(normalizeFieldName(key))) {
      continue;
    }

    if (Array.isArray(fieldValue)) {
      redacted[key] = fieldValue.map((entry) => (isPlainObject(entry) ? redactPushNotificationPayload(entry) : entry));
    } else if (isPlainObject(fieldValue)) {
      redacted[key] = redactPushNotificationPayload(fieldValue);
    } else {
      redacted[key] = fieldValue;
    }
  }

  return redacted;
}

export function redactPushNotificationValue(value) {
  return deepFreeze(redactPushNotificationPayload(value));
}

function createSafePushNotification(input, { category, redactSensitiveContent }) {
  const metadata = CATEGORY_METADATA[category];
  const safeBody = input.safeBody ?? input.redactedBody;
  const safeTitle = input.safeTitle ?? input.redactedTitle;
  const safeLockScreenBody = input.safeLockScreenBody ?? input.redactedLockScreenBody;
  const priority = normalizePriority(input.priority, metadata.priority);
  const requiresUserAction = input.requiresUserAction ?? metadata.requiresUserAction;
  const payload =
    redactSensitiveContent === false ? clone(input.payload ?? {}) : redactPushNotificationPayload(input.payload);

  return deepFreeze({
    id: String(input.id ?? `${category}.${Date.now()}`),
    category,
    type: String(input.type ?? metadata.defaultType),
    priority,
    visible: true,
    requiresUserAction,
    title: String(safeTitle ?? metadata.title),
    body: String(safeBody ?? metadata.body),
    lockScreenBody: String(safeLockScreenBody ?? input.lockScreenBody ?? safeBody ?? metadata.lockScreenBody),
    timestamp: normalizeTimestamp(input.timestamp),
    payload: deepFreeze(payload)
  });
}

export function createPushNotification(input = {}, options = {}) {
  if (!isPlainObject(input)) {
    throw new Error('Push notification input must be an object.');
  }

  const category = normalizePushNotificationCategory(input.category, input.type);

  return createSafePushNotification(input, {
    category,
    redactSensitiveContent: options.redactSensitiveContent
  });
}

export function normalizePushNotificationPreferences(settings = {}) {
  const notificationSettings = isPlainObject(settings.notifications) ? settings.notifications : settings;
  const categoriesInput = isPlainObject(notificationSettings.categories) ? notificationSettings.categories : {};
  const categories = {};

  for (const category of PUSH_NOTIFICATION_CATEGORIES) {
    categories[category] = categoriesInput[category] !== false;
  }

  return deepFreeze({
    enabled: notificationSettings.enabled !== false,
    messagePreviews: notificationSettings.messagePreviews !== false,
    sounds: notificationSettings.sounds !== false,
    mentionsOnly: notificationSettings.mentionsOnly === true,
    categories
  });
}

function normalizePermissionStatus(value) {
  const rawStatus = isPlainObject(value) ? value.status : value;
  const status = String(rawStatus ?? 'granted').trim().toLowerCase();
  const aliases = {
    allowed: 'granted',
    authorized: 'granted',
    granted: 'granted',
    quiet: 'provisional',
    provisional: 'provisional',
    default: 'prompt',
    prompt: 'prompt',
    'not-determined': 'prompt',
    notdetermined: 'prompt',
    undetermined: 'prompt',
    unknown: 'prompt',
    blocked: 'denied',
    denied: 'denied',
    unavailable: 'unsupported',
    unsupported: 'unsupported'
  };
  const normalized = aliases[status] ?? aliases[normalizeFieldName(status)];

  if (!normalized || !PUSH_NOTIFICATION_PERMISSION_STATUSES.includes(normalized)) {
    throw new Error(`Unsupported push notification permission status: ${rawStatus}`);
  }

  return normalized;
}

function notificationMentionsCurrentUser(notification) {
  return (
    notification.mentioned === true ||
    notification.payload?.mentioned === true ||
    notification.payload?.mentionsCurrentUser === true
  );
}

function createPermissionDetails(capability, status) {
  if (!capability) {
    return { status };
  }

  return {
    status,
    ...clone(capability.permission)
  };
}

function blockedPlan({ notification, category, capability, permissionStatus, reason, recoveryAction }) {
  return {
    deliver: false,
    reason,
    category,
    platform: capability?.platform ?? null,
    transport: capability?.transport ?? null,
    permission: createPermissionDetails(capability, permissionStatus),
    fallback: capability?.fallback ?? 'in-app-notification-center',
    recoveryAction,
    notification
  };
}

export function describePushNotificationPlatform(platform) {
  return clone(PLATFORM_CAPABILITIES[normalizePlatform(platform)]);
}

export function createPushNotificationDeliveryPlan(notification, options = {}) {
  if (!isPlainObject(notification)) {
    throw new Error('Push notification delivery plan requires a notification object.');
  }

  const category = normalizePushNotificationCategory(notification.category, notification.type);
  const safeNotification = createSafePushNotification(notification, {
    category,
    redactSensitiveContent: options.redactSensitiveContent
  });
  const metadata = CATEGORY_METADATA[category];
  const preferences = normalizePushNotificationPreferences(options.settings ?? {});
  const capability = options.platform ? describePushNotificationPlatform(options.platform) : null;

  if (preferences.categories[category] === false) {
    return blockedPlan({
      notification: safeNotification,
      category,
      capability,
      permissionStatus: 'granted',
      reason: 'category-disabled',
      recoveryAction: 'enable-notification-category'
    });
  }

  if (preferences.enabled === false && metadata.bypassesGlobalMute !== true) {
    return blockedPlan({
      notification: safeNotification,
      category,
      capability,
      permissionStatus: 'granted',
      reason: 'notifications-disabled',
      recoveryAction: 'enable-notifications'
    });
  }

  if (category === 'messages' && preferences.mentionsOnly === true && !notificationMentionsCurrentUser(safeNotification)) {
    return blockedPlan({
      notification: safeNotification,
      category,
      capability,
      permissionStatus: 'granted',
      reason: 'mention-filtered',
      recoveryAction: 'disable-mentions-only'
    });
  }

  const permissionStatus = normalizePermissionStatus(options.permissionStatus);

  if (permissionStatus === 'prompt') {
    return blockedPlan({
      notification: safeNotification,
      category,
      capability,
      permissionStatus,
      reason: 'permission-required',
      recoveryAction: 'request-notification-permission'
    });
  }

  if (permissionStatus === 'denied') {
    return blockedPlan({
      notification: safeNotification,
      category,
      capability,
      permissionStatus,
      reason: 'permission-denied',
      recoveryAction: 'open-platform-notification-settings'
    });
  }

  if (permissionStatus === 'unsupported') {
    return blockedPlan({
      notification: safeNotification,
      category,
      capability,
      permissionStatus,
      reason: 'permission-unsupported',
      recoveryAction: 'use-notification-fallback'
    });
  }

  return {
    deliver: true,
    reason: 'deliverable',
    category,
    platform: capability?.platform ?? null,
    transport: capability?.transport ?? null,
    permission: createPermissionDetails(capability, permissionStatus),
    fallback: capability?.fallback ?? 'in-app-notification-center',
    recoveryAction: null,
    presentation: permissionStatus === 'provisional' ? 'quiet' : 'alert',
    categoryCapability: capability?.categories?.[category] ? clone(capability.categories[category]) : null,
    notification: safeNotification
  };
}
