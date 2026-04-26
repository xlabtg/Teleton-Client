import { createPushNotificationDeliveryPlan, describePushNotificationPlatform } from '../foundation/push-notifications.mjs';
import { createMobileGesturePlan, createPlatformInputPlan } from './action-map.mjs';

export const IOS_BUNDLE_IDENTIFIER = 'dev.teleton.client';
export const IOS_APP_TARGET = 'TeletonClient';
export const IOS_SCHEME = 'TeletonClient';
export const IOS_ENTRY_POINT = 'TeletonClientApp';
export const IOS_KEYCHAIN_ACCESS_GROUP = IOS_BUNDLE_IDENTIFIER;
export const IOS_DEEP_LINK_SCHEMES = Object.freeze(['teleton', 'tg', 'ton', 'https']);

export const IOS_WRAPPER_STACK = deepFreeze({
  platform: 'ios',
  language: 'swift',
  uiToolkit: 'swiftui',
  buildSystem: 'xcodebuild',
  minOsVersion: '16.0',
  bundleIdentifier: IOS_BUNDLE_IDENTIFIER,
  appTarget: IOS_APP_TARGET,
  scheme: IOS_SCHEME,
  entryPoint: IOS_ENTRY_POINT,
  sharedIntegrations: ['tdlib', 'settings', 'agent', 'proxy', 'ton']
});

export const IOS_NOTIFICATION_CATEGORIES = deepFreeze({
  messages: {
    identifier: 'MESSAGES',
    name: 'Messages',
    threadIdentifier: 'messages',
    interruptionLevel: 'active',
    redactedPreview: true
  },
  agentActions: {
    identifier: 'AGENT_ACTION_REVIEW',
    name: 'Agent actions',
    threadIdentifier: 'agent-actions',
    interruptionLevel: 'time-sensitive',
    redactedPreview: true,
    requiresUserAction: true
  },
  agentRuntime: {
    identifier: 'AGENT_RUNTIME_STATUS',
    name: 'Agent runtime',
    threadIdentifier: 'agent-runtime',
    interruptionLevel: 'passive',
    redactedPreview: true
  },
  wallet: {
    identifier: 'WALLET_STATUS',
    name: 'TON wallet',
    threadIdentifier: 'ton-wallet',
    interruptionLevel: 'active',
    redactedPreview: true
  }
});

const DEBUG_ARTIFACT_PATH = 'ios/build/Build/Products/Debug-iphonesimulator/TeletonClient.app';
const DEFAULT_KEYCHAIN_ACCESSIBILITY = 'kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly';
const USER_PRESENCE_KEYCHAIN_ACCESSIBILITY = 'kSecAttrAccessibleWhenUnlockedThisDeviceOnly';

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

const SECRET_OPTION_FIELDS = new Set(['apiHash', 'mnemonic', 'passphrase', 'privateKey', 'secret', 'seedPhrase', 'token', 'value']);

const IOS_KEYCHAIN_PURPOSES = deepFreeze({
  'tdlib.credentials': {
    key: 'tdlibCredentials',
    account: 'application',
    accessibility: DEFAULT_KEYCHAIN_ACCESSIBILITY,
    accessControl: []
  },
  'agent.memory-key': {
    key: 'agentMemoryKey',
    account: 'application',
    accessibility: DEFAULT_KEYCHAIN_ACCESSIBILITY,
    accessControl: []
  },
  'agent.local-token': {
    key: 'agentLocalToken',
    account: 'application',
    accessibility: DEFAULT_KEYCHAIN_ACCESSIBILITY,
    accessControl: []
  },
  'proxy.credentials': {
    key: 'proxyCredentials',
    account: 'application',
    accessibility: DEFAULT_KEYCHAIN_ACCESSIBILITY,
    accessControl: []
  },
  'ton.wallet': {
    key: 'tonWallet',
    account: 'primary',
    accessibility: USER_PRESENCE_KEYCHAIN_ACCESSIBILITY,
    accessControl: ['biometryCurrentSet', 'userPresence'],
    requiresUserPresence: true
  }
});

const IOS_BACKGROUND_TASKS = deepFreeze({
  agentRuntime: {
    api: 'BGProcessingTask',
    scheduler: 'BGTaskScheduler',
    identifier: 'dev.teleton.client.agent.runtime',
    backgroundMode: 'processing',
    requiresNetworkConnectivity: false,
    requiresExternalPower: false,
    launchesOnlyWhenAllowedBySystem: true,
    permittedWhenUserEnabledLocalAgent: true,
    expirationHandler: 'stop-agent-work-and-persist-resumable-state',
    suspensionFallback: 'pause-local-agent-and-request-user-resume'
  },
  messageSync: {
    api: 'BGAppRefreshTask',
    scheduler: 'BGTaskScheduler',
    identifier: 'dev.teleton.client.message.sync',
    backgroundMode: 'remote-notification',
    pushTrigger: 'APNs content-available',
    requiresNetworkConnectivity: true,
    launchesOnlyWhenAllowedBySystem: true,
    expirationHandler: 'persist-cursor-and-reschedule'
  },
  tonStatusRefresh: {
    api: 'BGAppRefreshTask',
    scheduler: 'BGTaskScheduler',
    identifier: 'dev.teleton.client.ton.status-refresh',
    backgroundMode: 'fetch',
    requiresNetworkConnectivity: true,
    requiresUserInitiatedRefresh: false,
    walletSigningAllowed: false,
    expirationHandler: 'persist-wallet-status-and-reschedule'
  }
});

const IOS_COMPLIANCE_NOTES = deepFreeze({
  requiresHumanReview: true,
  appStoreReview: {
    messages:
      'Messaging behavior must stay user-controlled messaging, avoid spam-like automation, and keep notification previews redacted by default.',
    agentAutomation:
      'AI automation must disclose local or cloud processing, preserve audit history, and require explicit user confirmation before sending messages, changing settings, or taking irreversible actions.',
    wallet:
      'TON wallet and crypto features must use reviewed wallet-provider or Keychain references, keep no raw private keys in shared code or logs, and require confirmation before signing or broadcasting transactions.',
    backgroundExecution:
      'Agent, message, and wallet refresh work must use system-managed background execution through APNs and BGTaskScheduler instead of indefinite background execution.'
  },
  reviewChecklist: [
    'Confirm App Store metadata explains Telegram-compatible messaging and Teleton Agent automation controls.',
    'Confirm APNs payloads do not include message text, prompts, wallet secrets, or raw proxy credentials.',
    'Confirm TON transfer, swap, staking, and signing flows stay confirmation-gated and eligible for legal review.',
    'Confirm background task identifiers, modes, and entitlements match the native Xcode project before submission.'
  ]
});

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

function normalizeIdentifier(value, label) {
  const identifier = String(value ?? '').trim();

  if (!/^[A-Za-z0-9_.-]+$/.test(identifier)) {
    throw new Error(`${label} must contain only letters, numbers, dots, underscores, or hyphens.`);
  }

  return identifier;
}

function assertNoSecretMaterial(options) {
  for (const field of SECRET_OPTION_FIELDS) {
    if (options[field] !== undefined) {
      throw new Error(`iOS Keychain references must not receive raw ${field} material.`);
    }
  }
}

function keychainPurposeConfig(purpose) {
  const normalizedPurpose = normalizeIdentifier(purpose, 'Keychain purpose');
  const config = IOS_KEYCHAIN_PURPOSES[normalizedPurpose];

  if (!config) {
    throw new Error(`Unsupported iOS Keychain purpose: ${purpose}`);
  }

  return { normalizedPurpose, config };
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

function normalizeNotificationCategory(notification) {
  if (notification.type?.startsWith('agent.action')) {
    return IOS_NOTIFICATION_CATEGORIES.agentActions;
  }

  if (notification.type?.startsWith('agent.runtime')) {
    return IOS_NOTIFICATION_CATEGORIES.agentRuntime;
  }

  if (notification.type?.startsWith('ton.')) {
    return IOS_NOTIFICATION_CATEGORIES.wallet;
  }

  return IOS_NOTIFICATION_CATEGORIES.messages;
}

function routeForNotification(notification) {
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
    platform: 'ios',
    source,
    workflow,
    sharedModule,
    payload
  };
}

function rejectedRoute(reason, source = 'url-scheme') {
  return {
    accepted: false,
    platform: 'ios',
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

export function createIosDebugBuildArtifact(options = {}) {
  return {
    platform: 'ios',
    variant: 'debug',
    format: 'app-bundle',
    sdk: 'iphonesimulator',
    path: DEBUG_ARTIFACT_PATH,
    bundleIdentifier: IOS_BUNDLE_IDENTIFIER,
    appTarget: IOS_APP_TARGET,
    scheme: IOS_SCHEME,
    entryPoint: IOS_ENTRY_POINT,
    buildId: String(options.buildId ?? 'local-debug'),
    installable: true,
    runnable: true
  };
}

export function createIosKeychainReference(purpose, options = {}) {
  assertNoSecretMaterial(options);
  const { normalizedPurpose, config } = keychainPurposeConfig(purpose);
  const account = normalizeIdentifier(options.account ?? config.account, 'Keychain account');
  const accessGroup = normalizeIdentifier(options.accessGroup ?? IOS_KEYCHAIN_ACCESS_GROUP, 'Keychain access group');
  const service = `${IOS_BUNDLE_IDENTIFIER}.${normalizedPurpose}`;

  return {
    platform: 'ios',
    api: 'Keychain Services',
    storageClass: 'generic-password',
    accessGroup,
    service,
    account,
    secureRef: `keychain:${service}.${account}`,
    accessibility: options.accessibility ?? config.accessibility,
    synchronizable: false,
    accessControl: [...config.accessControl],
    exportable: false,
    ...(config.requiresUserPresence ? { requiresUserPresence: true } : {})
  };
}

export function describeIosKeychainStorage() {
  const items = {};

  for (const [purpose, config] of Object.entries(IOS_KEYCHAIN_PURPOSES)) {
    items[config.key] = createIosKeychainReference(purpose);
  }

  return {
    platform: 'ios',
    api: 'Keychain Services',
    storageClass: 'generic-password',
    accessGroup: IOS_KEYCHAIN_ACCESS_GROUP,
    defaultAccessibility: DEFAULT_KEYCHAIN_ACCESSIBILITY,
    synchronizable: false,
    items
  };
}

export function createIosPushNotificationRequest(notification, options = {}) {
  if (!isPlainObject(notification)) {
    throw new Error('iOS push notification request requires a shared notification object.');
  }

  if (!shouldDeliverNotification(notification, options.settings)) {
    return null;
  }

  const category = normalizeNotificationCategory(notification);
  const payload = redactNotificationPayload(notification.payload);
  const notificationId = String(notification.id ?? `${category.identifier}.${Date.now()}`);

  return {
    platform: 'ios',
    api: 'UNUserNotificationCenter',
    transport: 'APNs',
    authorizationOptions: ['alert', 'badge', 'sound'],
    notificationId,
    categoryIdentifier: category.identifier,
    apns: {
      pushType: 'alert',
      topic: IOS_BUNDLE_IDENTIFIER,
      priority: category.interruptionLevel === 'passive' ? 5 : 10,
      collapseId: notificationId
    },
    content: {
      title: category.name,
      body: String(notification.lockScreenBody ?? ''),
      lockScreenBody: String(notification.lockScreenBody ?? ''),
      threadIdentifier: category.threadIdentifier,
      interruptionLevel: category.interruptionLevel,
      sound: 'default'
    },
    userInfo: {
      notificationId,
      route: routeForNotification(notification),
      payload
    }
  };
}

export function createIosPushNotificationPlan(notification, options = {}) {
  const delivery = createPushNotificationDeliveryPlan(notification, {
    ...options,
    platform: 'ios'
  });

  if (!delivery.deliver) {
    return delivery;
  }

  return {
    ...delivery,
    request: createIosPushNotificationRequest(delivery.notification)
  };
}

export function describeIosBackgroundTasks() {
  return clone(IOS_BACKGROUND_TASKS);
}

export function describeIosComplianceNotes() {
  return clone(IOS_COMPLIANCE_NOTES);
}

export function describeIosGestures(options = {}) {
  return createMobileGesturePlan('ios', options);
}

export function routeIosDeepLink(input) {
  let url;
  try {
    url = new URL(String(input));
  } catch {
    return rejectedRoute('invalid_url');
  }

  const scheme = url.protocol.replace(/:$/, '').toLowerCase();
  if (!IOS_DEEP_LINK_SCHEMES.includes(scheme)) {
    return rejectedRoute('unsupported_scheme');
  }

  const source = scheme === 'https' ? 'universal-link' : 'url-scheme';
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

export function describeIosWrapper() {
  return {
    stack: clone(IOS_WRAPPER_STACK),
    debugArtifact: createIosDebugBuildArtifact(),
    keychain: describeIosKeychainStorage(),
    notificationCategories: clone(IOS_NOTIFICATION_CATEGORIES),
    pushNotifications: describePushNotificationPlatform('ios'),
    backgroundTasks: describeIosBackgroundTasks(),
    gestures: describeIosGestures(),
    inputActions: createPlatformInputPlan('ios'),
    deepLinks: {
      schemes: [...IOS_DEEP_LINK_SCHEMES],
      appDelegateEntry: 'application(_:open:options:)',
      sceneDelegateEntry: 'scene(_:openURLContexts:)',
      universalLinkEntry: 'scene(_:continue:)',
      associatedDomains: ['applinks:t.me', 'applinks:telegram.me']
    },
    compliance: describeIosComplianceNotes()
  };
}
