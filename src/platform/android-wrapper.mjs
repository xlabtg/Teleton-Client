export const ANDROID_PACKAGE_NAME = 'dev.teleton.client';
export const ANDROID_ENTRY_ACTIVITY = `${ANDROID_PACKAGE_NAME}.MainActivity`;
export const ANDROID_DEEP_LINK_SCHEMES = Object.freeze(['teleton', 'tg', 'ton', 'https']);

export const ANDROID_WRAPPER_STACK = deepFreeze({
  platform: 'android',
  language: 'kotlin',
  uiToolkit: 'jetpack-compose',
  buildSystem: 'gradle-android-plugin',
  minSdk: 26,
  targetSdk: 35,
  packageName: ANDROID_PACKAGE_NAME,
  entryActivity: ANDROID_ENTRY_ACTIVITY,
  sharedIntegrations: ['tdlib', 'settings', 'agent', 'proxy', 'ton']
});

export const ANDROID_NOTIFICATION_CHANNELS = deepFreeze({
  messages: {
    id: 'messages',
    name: 'Messages',
    importance: 'default',
    category: 'message',
    visibility: 'private',
    redactedLockScreen: true
  },
  agentActions: {
    id: 'agent_actions',
    name: 'Agent actions',
    importance: 'high',
    category: 'status',
    visibility: 'private',
    redactedLockScreen: true
  },
  agentRuntime: {
    id: 'agent_runtime',
    name: 'Agent runtime',
    importance: 'low',
    category: 'service',
    visibility: 'private',
    redactedLockScreen: true
  },
  wallet: {
    id: 'wallet',
    name: 'TON wallet',
    importance: 'default',
    category: 'status',
    visibility: 'private',
    redactedLockScreen: true
  }
});

const ANDROID_BACKGROUND_WORK = deepFreeze({
  agentRuntime: {
    api: 'ForegroundService',
    service: `${ANDROID_PACKAGE_NAME}.agent.TeletonAgentForegroundService`,
    exported: false,
    notificationChannelId: ANDROID_NOTIFICATION_CHANNELS.agentRuntime.id,
    foregroundServiceTypes: ['dataSync'],
    startPolicy: 'user-initiated-or-notification-action',
    stopPolicy: 'stopSelf-and-supervisor-shutdown'
  },
  messageSync: {
    api: 'WorkManager',
    worker: `${ANDROID_PACKAGE_NAME}.sync.MessageSyncWorker`,
    expedited: true,
    foregroundInfoRequired: true,
    notificationChannelId: ANDROID_NOTIFICATION_CHANNELS.messages.id,
    constraints: {
      networkType: 'connected'
    }
  },
  tonStatusRefresh: {
    api: 'WorkManager',
    worker: `${ANDROID_PACKAGE_NAME}.ton.TonStatusRefreshWorker`,
    expedited: false,
    foregroundInfoRequired: false,
    notificationChannelId: ANDROID_NOTIFICATION_CHANNELS.wallet.id,
    constraints: {
      networkType: 'connected',
      requiresBatteryNotLow: true
    }
  }
});

const DEBUG_ARTIFACT_PATH = 'android/app/build/outputs/apk/debug/app-debug.apk';
const PRIVATE_NOTIFICATION_FIELDS = new Set([
  'body',
  'chatName',
  'chatTitle',
  'content',
  'context',
  'message',
  'messageText',
  'prompt',
  'recipientName',
  'senderName',
  'text'
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

function redactNotificationPayload(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  const redacted = {};

  for (const [key, fieldValue] of Object.entries(value)) {
    if (PRIVATE_NOTIFICATION_FIELDS.has(key)) {
      continue;
    }

    if (Array.isArray(fieldValue)) {
      redacted[key] = fieldValue.map((entry) => (isPlainObject(entry) ? redactNotificationPayload(entry) : entry));
    } else if (isPlainObject(fieldValue)) {
      redacted[key] = redactNotificationPayload(fieldValue);
    } else {
      redacted[key] = fieldValue;
    }
  }

  return redacted;
}

function shouldDeliverNotification(notification, settings = {}) {
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

function normalizeNotificationChannel(notification) {
  if (notification.type?.startsWith('agent.action')) {
    return ANDROID_NOTIFICATION_CHANNELS.agentActions;
  }

  if (notification.type?.startsWith('ton.')) {
    return ANDROID_NOTIFICATION_CHANNELS.wallet;
  }

  return ANDROID_NOTIFICATION_CHANNELS.messages;
}

function pendingIntentRouteFor(notification) {
  if (notification.requiresUserAction || notification.priority === 'critical') {
    return 'agent.action.review';
  }

  if (notification.type?.startsWith('ton.')) {
    return 'ton.wallet.open';
  }

  return 'messaging.open';
}

function decodePathSegments(pathname) {
  return pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
}

function acceptedRoute(source, workflow, sharedModule, payload = {}) {
  return {
    accepted: true,
    platform: 'android',
    source,
    workflow,
    sharedModule,
    payload
  };
}

function rejectedRoute(reason, source = 'deep-link') {
  return {
    accepted: false,
    platform: 'android',
    source,
    reason
  };
}

function routeTelegramLink(url, source) {
  const host = url.hostname.toLowerCase();
  const segments = decodePathSegments(url.pathname);

  if (url.protocol === 'tg:' && host === 'resolve') {
    const username = (url.searchParams.get('domain') ?? '').trim().replace(/^@/, '');
    if (!username) {
      return rejectedRoute('missing_telegram_domain', source);
    }

    const messageId = (url.searchParams.get('post') ?? '').trim();
    if (messageId) {
      return acceptedRoute(source, 'messaging.openMessage', 'tdlib', { username, messageId });
    }

    return acceptedRoute(source, 'messaging.openChat', 'tdlib', { username });
  }

  if (url.protocol === 'tg:' && host === 'msg') {
    const text = (url.searchParams.get('text') ?? '').trim();
    return acceptedRoute(source, 'messaging.composeMessage', 'tdlib', text ? { text } : {});
  }

  if (url.protocol === 'https:' && ['t.me', 'telegram.me'].includes(host)) {
    const username = (segments[0] ?? '').trim().replace(/^@/, '');
    if (!username) {
      return rejectedRoute('missing_telegram_path', source);
    }

    if (segments[1]) {
      return acceptedRoute(source, 'messaging.openMessage', 'tdlib', {
        username,
        messageId: segments[1]
      });
    }

    return acceptedRoute(source, 'messaging.openChat', 'tdlib', { username });
  }

  return null;
}

function routeTonLink(url, source) {
  const host = url.hostname.toLowerCase();
  const segments = decodePathSegments(url.pathname);

  if (host === 'transfer') {
    const recipientAddress = (segments[0] ?? url.searchParams.get('address') ?? url.searchParams.get('to') ?? '').trim();
    if (!recipientAddress) {
      return rejectedRoute('missing_ton_recipient', source);
    }

    const payload = {
      recipientAddress,
      requiresConfirmation: true
    };
    const amountNano = (url.searchParams.get('amount') ?? '').trim();
    const comment = (url.searchParams.get('text') ?? url.searchParams.get('comment') ?? '').trim();

    if (amountNano) {
      payload.amountNano = amountNano;
    }

    if (comment) {
      payload.comment = comment;
    }

    return acceptedRoute(source, 'ton.transfer.review', 'ton', payload);
  }

  if (host === 'dns' || host === 'resolve') {
    const name = (segments[0] ?? url.searchParams.get('name') ?? '').trim().toLowerCase();
    if (!name) {
      return rejectedRoute('missing_ton_name', source);
    }

    return acceptedRoute(source, 'ton.dns.resolve', 'ton', { name });
  }

  return null;
}

function routeTeletonLink(url, source) {
  const host = url.hostname.toLowerCase();
  const segments = decodePathSegments(url.pathname);

  if (host === 'chat') {
    const chatId = (segments[0] ?? url.searchParams.get('id') ?? '').trim();
    return chatId
      ? acceptedRoute(source, 'messaging.openChat', 'tdlib', { chatId })
      : rejectedRoute('missing_chat_id', source);
  }

  if (host === 'settings') {
    return acceptedRoute(source, 'settings.openSection', 'settings', {
      section: segments[0] ?? 'root'
    });
  }

  if (host === 'agent' && segments[0] === 'action') {
    const actionId = (segments[1] ?? url.searchParams.get('id') ?? '').trim();
    return actionId
      ? acceptedRoute(source, 'agent.action.review', 'agent', { actionId })
      : rejectedRoute('missing_agent_action_id', source);
  }

  if (host === 'proxy') {
    return acceptedRoute(source, 'proxy.openSettings', 'proxy', {
      proxyId: segments[0] ?? null
    });
  }

  if (host === 'ton' && segments[0] === 'transfer') {
    const recipientAddress = (url.searchParams.get('address') ?? url.searchParams.get('to') ?? '').trim();
    return recipientAddress
      ? acceptedRoute(source, 'ton.transfer.review', 'ton', { recipientAddress, requiresConfirmation: true })
      : rejectedRoute('missing_ton_recipient', source);
  }

  return null;
}

export function createAndroidDebugBuildArtifact(options = {}) {
  return {
    platform: 'android',
    variant: 'debug',
    format: 'apk',
    path: DEBUG_ARTIFACT_PATH,
    packageName: ANDROID_PACKAGE_NAME,
    entryActivity: ANDROID_ENTRY_ACTIVITY,
    buildId: String(options.buildId ?? 'local-debug'),
    installable: true,
    runnable: true
  };
}

export function describeAndroidBackgroundWork() {
  return clone(ANDROID_BACKGROUND_WORK);
}

export function createAndroidNotificationRequest(notification, options = {}) {
  if (!isPlainObject(notification)) {
    throw new Error('Android notification request requires a shared notification object.');
  }

  if (!shouldDeliverNotification(notification, options.settings)) {
    return null;
  }

  const channel = normalizeNotificationChannel(notification);
  const payload = redactNotificationPayload(notification.payload);

  return {
    platform: 'android',
    api: 'NotificationCompat',
    permission: 'android.permission.POST_NOTIFICATIONS',
    notificationId: String(notification.id ?? `${channel.id}.${Date.now()}`),
    channelId: channel.id,
    channelName: channel.name,
    priority: notification.priority ?? 'normal',
    category: channel.category,
    visibility: channel.visibility,
    title: String(notification.title ?? ''),
    body: String(notification.body ?? ''),
    lockScreenBody: String(notification.lockScreenBody ?? ''),
    foregroundServiceEligible: channel.id === 'agent_runtime' || notification.requiresUserAction === true,
    pendingIntent: {
      route: pendingIntentRouteFor(notification),
      flags: ['FLAG_IMMUTABLE', 'FLAG_UPDATE_CURRENT'],
      extras: {
        notificationId: String(notification.id ?? ''),
        payload
      }
    }
  };
}

export function routeAndroidDeepLink(input) {
  let url;
  try {
    url = new URL(String(input));
  } catch {
    return rejectedRoute('invalid_url');
  }

  const scheme = url.protocol.replace(/:$/, '').toLowerCase();
  if (!ANDROID_DEEP_LINK_SCHEMES.includes(scheme)) {
    return rejectedRoute('unsupported_scheme');
  }

  const source = scheme === 'https' ? 'app-link' : 'deep-link';
  const telegramRoute = routeTelegramLink(url, source);
  if (telegramRoute) {
    return telegramRoute;
  }

  if (scheme === 'ton') {
    return routeTonLink(url, source) ?? rejectedRoute('unsupported_ton_link', source);
  }

  if (scheme === 'teleton') {
    return routeTeletonLink(url, source) ?? rejectedRoute('unsupported_teleton_link', source);
  }

  return rejectedRoute('unsupported_deep_link', source);
}

export function describeAndroidWrapper() {
  return {
    stack: clone(ANDROID_WRAPPER_STACK),
    debugArtifact: createAndroidDebugBuildArtifact(),
    notificationChannels: clone(ANDROID_NOTIFICATION_CHANNELS),
    backgroundWork: describeAndroidBackgroundWork(),
    deepLinks: {
      schemes: [...ANDROID_DEEP_LINK_SCHEMES],
      entryActivity: ANDROID_ENTRY_ACTIVITY,
      manifestAction: 'android.intent.action.VIEW',
      categories: ['android.intent.category.DEFAULT', 'android.intent.category.BROWSABLE']
    }
  };
}
