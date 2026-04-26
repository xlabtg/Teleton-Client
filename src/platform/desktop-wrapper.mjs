export const DESKTOP_APP_ID = 'dev.teleton.client';
export const DESKTOP_PRODUCT_NAME = 'Teleton Client';
export const DESKTOP_DEEP_LINK_SCHEMES = Object.freeze(['teleton', 'tg', 'ton', 'https']);

export const DESKTOP_WRAPPER_STACK = deepFreeze({
  platform: 'desktop',
  runtime: 'electron',
  language: 'javascript',
  uiToolkit: 'web',
  buildSystem: 'electron-builder',
  appId: DESKTOP_APP_ID,
  productName: DESKTOP_PRODUCT_NAME,
  mainProcessEntry: 'desktop/main.mjs',
  preloadEntry: 'desktop/preload.mjs',
  rendererEntry: 'desktop/renderer',
  targetOs: ['macos', 'windows', 'linux'],
  security: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true
  },
  sharedIntegrations: ['tdlib', 'settings', 'agent', 'proxy', 'ton']
});

const DESKTOP_NOTIFICATION_CATEGORIES = deepFreeze({
  messages: {
    id: 'messages',
    name: 'Messages',
    urgency: 'normal',
    route: 'messaging.open',
    redactsBodyByDefault: true,
    fallbackBody: 'New message'
  },
  agentActions: {
    id: 'agent_actions',
    name: 'Agent actions',
    urgency: 'critical',
    route: 'agent.action.review',
    redactsBodyByDefault: false,
    fallbackBody: 'Agent action requires review'
  },
  agentRuntime: {
    id: 'agent_runtime',
    name: 'Agent runtime',
    urgency: 'low',
    route: 'agent.runtime.open',
    redactsBodyByDefault: true,
    fallbackBody: 'Agent runtime status changed'
  },
  wallet: {
    id: 'wallet',
    name: 'TON wallet',
    urgency: 'normal',
    route: 'ton.wallet.open',
    redactsBodyByDefault: true,
    fallbackBody: 'TON wallet status changed'
  }
});

const DESKTOP_PACKAGING_TARGETS = deepFreeze({
  macos: {
    os: 'macos',
    format: 'dmg',
    builderTarget: 'dmg',
    artifactName: 'Teleton Client-${version}-macos-${arch}.dmg',
    bundleFormat: 'app',
    signing: 'Developer ID Application',
    notarizationRequired: true,
    distribution: 'drag-and-drop-dmg'
  },
  windows: {
    os: 'windows',
    format: 'exe',
    builderTarget: 'nsis',
    artifactName: 'Teleton Client Setup ${version}-${arch}.exe',
    signing: 'Authenticode',
    installer: 'per-user-nsis',
    autoUpdateBlocker: 'unsigned-builds-disabled'
  },
  linux: {
    os: 'linux',
    format: 'AppImage',
    builderTarget: 'AppImage',
    artifactName: 'Teleton Client-${version}-${arch}.AppImage',
    desktopEntry: `${DESKTOP_APP_ID}.desktop`,
    signing: 'optional-appimage-signature',
    sandboxNotes: 'Use distro sandboxing or portal integrations where available.'
  }
});

const DESKTOP_SHORTCUTS = deepFreeze({
  api: {
    local: 'BrowserWindow webContents before-input-event',
    global: 'Electron globalShortcut'
  },
  local: [
    {
      id: 'messaging.search',
      accelerator: 'CommandOrControl+K',
      route: 'messaging.search',
      scope: 'focused-main-window'
    },
    {
      id: 'chat.new',
      accelerator: 'CommandOrControl+N',
      route: 'messaging.composeMessage',
      scope: 'focused-main-window'
    },
    {
      id: 'chat.next',
      accelerator: 'Alt+ArrowDown',
      route: 'messaging.selectNextChat',
      scope: 'focused-main-window'
    },
    {
      id: 'chat.previous',
      accelerator: 'Alt+ArrowUp',
      route: 'messaging.selectPreviousChat',
      scope: 'focused-main-window'
    },
    {
      id: 'agent.quickAction',
      accelerator: 'CommandOrControl+Shift+A',
      route: 'agent.action.compose',
      scope: 'focused-main-window',
      requiresUserConfirmation: true
    },
    {
      id: 'wallet.open',
      accelerator: 'CommandOrControl+Shift+W',
      route: 'ton.wallet.open',
      scope: 'focused-main-window'
    }
  ],
  global: [
    {
      id: 'window.showHide',
      accelerator: 'CommandOrControl+Shift+T',
      route: 'window.toggleVisible',
      registration: 'opt-in-user-setting'
    },
    {
      id: 'notifications.muteToggle',
      accelerator: 'CommandOrControl+Shift+M',
      route: 'settings.notifications.toggleMute',
      registration: 'opt-in-user-setting'
    }
  ]
});

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

function normalizeDesktopOs(value) {
  const os = String(value ?? '').trim().toLowerCase();
  const aliases = {
    darwin: 'macos',
    mac: 'macos',
    osx: 'macos',
    win32: 'windows',
    win: 'windows',
    linux: 'linux'
  };
  const normalized = aliases[os] ?? os;

  if (!DESKTOP_WRAPPER_STACK.targetOs.includes(normalized)) {
    throw new Error(`Unsupported desktop OS: ${value}`);
  }

  return normalized;
}

function normalizeArch(value) {
  const arch = String(value ?? '').trim().toLowerCase();

  if (!/^[a-z0-9_-]+$/.test(arch)) {
    throw new Error(`Unsupported desktop architecture: ${value}`);
  }

  return arch;
}

function normalizeNonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

function formatStatus(value) {
  const status = String(value ?? 'stopped').trim().toLowerCase();
  return status ? `${status[0].toUpperCase()}${status.slice(1)}` : 'Stopped';
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
    return DESKTOP_NOTIFICATION_CATEGORIES.agentActions;
  }

  if (notification.type?.startsWith('agent.runtime')) {
    return DESKTOP_NOTIFICATION_CATEGORIES.agentRuntime;
  }

  if (notification.type?.startsWith('ton.')) {
    return DESKTOP_NOTIFICATION_CATEGORIES.wallet;
  }

  return DESKTOP_NOTIFICATION_CATEGORIES.messages;
}

function routeForNotification(notification, category) {
  if (notification.requiresUserAction || notification.priority === 'critical') {
    return 'agent.action.review';
  }

  return category.route;
}

function desktopNotificationBody(notification, category) {
  if (notification.lockScreenBody) {
    return String(notification.lockScreenBody);
  }

  if (category.redactsBodyByDefault) {
    return category.fallbackBody;
  }

  return String(notification.body ?? category.fallbackBody);
}

function debugArtifactPath(os, arch) {
  if (os === 'macos') {
    return `desktop/out/debug/macos-${arch}/${DESKTOP_PRODUCT_NAME}.app`;
  }

  if (os === 'windows') {
    return `desktop/out/debug/windows-${arch}/${DESKTOP_PRODUCT_NAME}.exe`;
  }

  return `desktop/out/debug/linux-${arch}/teleton-client`;
}

function debugArtifactFormat(os) {
  if (os === 'macos') {
    return 'app-bundle';
  }

  if (os === 'windows') {
    return 'exe';
  }

  return 'executable';
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
    platform: 'desktop',
    source,
    workflow,
    sharedModule,
    payload
  };
}

function rejectedRoute(reason, source = 'protocol-handler') {
  return {
    accepted: false,
    platform: 'desktop',
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

function createLinuxDesktopEntry({ enabled, openAsHidden }) {
  const args = openAsHidden ? ' --hidden' : '';
  return [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${DESKTOP_PRODUCT_NAME}`,
    `Exec=teleton-client${args}`,
    'Terminal=false',
    `X-GNOME-Autostart-enabled=${enabled ? 'true' : 'false'}`
  ].join('\n');
}

export function createDesktopDebugBuildArtifact(options = {}) {
  const os = normalizeDesktopOs(options.os ?? 'linux');
  const arch = normalizeArch(options.arch ?? 'x64');

  return {
    platform: 'desktop',
    os,
    variant: 'debug',
    format: debugArtifactFormat(os),
    arch,
    path: debugArtifactPath(os, arch),
    appId: DESKTOP_APP_ID,
    productName: DESKTOP_PRODUCT_NAME,
    buildId: String(options.buildId ?? 'local-debug'),
    installable: false,
    runnable: true
  };
}

export function describeDesktopPackagingPlan() {
  return clone(DESKTOP_PACKAGING_TARGETS);
}

export function createDesktopTrayMenu(state = {}) {
  const unreadCount = normalizeNonNegativeInteger(state.unreadCount);
  const notificationsEnabled = state.notificationsEnabled !== false;
  const autostartEnabled = state.autostartEnabled === true;
  const agentStatus = formatStatus(state.agentStatus);

  return {
    platform: 'desktop',
    api: 'Electron Tray',
    icon: 'desktop/assets/trayTemplate.png',
    tooltip: unreadCount > 0 ? `${DESKTOP_PRODUCT_NAME} - ${unreadCount} unread` : DESKTOP_PRODUCT_NAME,
    badge: {
      visible: unreadCount > 0,
      count: unreadCount,
      label: unreadCount > 0 ? `${unreadCount} unread messages` : 'No unread messages'
    },
    items: [
      {
        id: 'window.open',
        label: 'Open Teleton Client',
        type: 'normal',
        route: 'messaging.open',
        accelerator: 'CommandOrControl+O'
      },
      {
        id: 'messaging.unread',
        label: `Unread messages: ${unreadCount}`,
        type: 'normal',
        route: 'messaging.openUnread',
        enabled: unreadCount > 0
      },
      { type: 'separator' },
      {
        id: 'agent.runtime',
        label: `Agent: ${agentStatus}`,
        type: 'normal',
        route: 'agent.runtime.open'
      },
      {
        id: 'ton.wallet',
        label: 'TON wallet',
        type: 'normal',
        route: 'ton.wallet.open'
      },
      { type: 'separator' },
      {
        id: 'notifications.toggle',
        label: notificationsEnabled ? 'Mute notifications' : 'Unmute notifications',
        type: 'checkbox',
        route: 'settings.notifications.toggleMute',
        checked: notificationsEnabled
      },
      {
        id: 'autostart.toggle',
        label: 'Launch at login',
        type: 'checkbox',
        route: 'settings.desktop.autostart.toggle',
        checked: autostartEnabled
      },
      { type: 'separator' },
      {
        id: 'app.quit',
        label: 'Quit Teleton Client',
        role: 'quit'
      }
    ]
  };
}

export function createDesktopNotificationRequest(notification, options = {}) {
  if (!isPlainObject(notification)) {
    throw new Error('Desktop notification request requires a shared notification object.');
  }

  if (!shouldDeliverNotification(notification, options.settings)) {
    return null;
  }

  const category = normalizeNotificationCategory(notification);
  const notificationId = String(notification.id ?? `${category.id}.${Date.now()}`);
  const route = routeForNotification(notification, category);

  return {
    platform: 'desktop',
    api: 'Electron Notification',
    permission: 'system-notifications',
    notificationId,
    categoryId: category.id,
    urgency: notification.requiresUserAction || notification.priority === 'critical' ? 'critical' : category.urgency,
    title: category.name,
    body: desktopNotificationBody(notification, category),
    silent: false,
    route,
    activation: {
      event: 'click',
      window: 'main',
      focus: true,
      route
    },
    payload: redactNotificationPayload(notification.payload)
  };
}

export function describeDesktopShortcuts() {
  return clone(DESKTOP_SHORTCUTS);
}

export function createDesktopAutostartConfig(options = {}) {
  const os = normalizeDesktopOs(options.os ?? 'linux');
  const enabled = options.enabled === true;
  const openAsHidden = options.openAsHidden === true;
  const args = openAsHidden ? ['--hidden'] : [];

  if (os === 'linux') {
    return {
      platform: 'desktop',
      os,
      enabled,
      api: 'XDG Autostart',
      desktopEntryPath: `~/.config/autostart/${DESKTOP_APP_ID}.desktop`,
      desktopEntry: createLinuxDesktopEntry({ enabled, openAsHidden }),
      userControlled: true
    };
  }

  if (os === 'windows') {
    return {
      platform: 'desktop',
      os,
      enabled,
      api: 'app.setLoginItemSettings',
      registryScope: 'current-user-run-key',
      userControlled: true,
      settings: {
        openAtLogin: enabled,
        path: '<app-executable>',
        args
      }
    };
  }

  return {
    platform: 'desktop',
    os,
    enabled,
    api: 'app.setLoginItemSettings',
    service: 'ServiceManagement login item',
    userControlled: true,
    settings: {
      openAtLogin: enabled,
      openAsHidden,
      args
    }
  };
}

export function describeDesktopAutostart() {
  return {
    platform: 'desktop',
    defaultEnabled: false,
    userControlled: true,
    settingsKey: 'desktop.autostart.enabled',
    platforms: {
      macos: createDesktopAutostartConfig({ os: 'macos' }),
      windows: createDesktopAutostartConfig({ os: 'windows' }),
      linux: createDesktopAutostartConfig({ os: 'linux' })
    }
  };
}

export function routeDesktopDeepLink(input) {
  let url;
  try {
    url = new URL(String(input));
  } catch {
    return rejectedRoute('invalid_url');
  }

  const scheme = url.protocol.replace(/:$/, '').toLowerCase();
  if (!DESKTOP_DEEP_LINK_SCHEMES.includes(scheme)) {
    return rejectedRoute('unsupported_scheme');
  }

  const source = scheme === 'https' ? 'app-link' : 'protocol-handler';
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

export function describeDesktopWrapper() {
  return {
    stack: clone(DESKTOP_WRAPPER_STACK),
    debugArtifacts: {
      macos: createDesktopDebugBuildArtifact({ os: 'macos' }),
      windows: createDesktopDebugBuildArtifact({ os: 'windows' }),
      linux: createDesktopDebugBuildArtifact({ os: 'linux' })
    },
    tray: createDesktopTrayMenu(),
    shortcuts: describeDesktopShortcuts(),
    autostart: describeDesktopAutostart(),
    notifications: clone(DESKTOP_NOTIFICATION_CATEGORIES),
    deepLinks: {
      schemes: [...DESKTOP_DEEP_LINK_SCHEMES],
      protocolApi: 'app.setAsDefaultProtocolClient',
      appLinkHosts: ['t.me', 'telegram.me']
    },
    packaging: describeDesktopPackagingPlan()
  };
}
