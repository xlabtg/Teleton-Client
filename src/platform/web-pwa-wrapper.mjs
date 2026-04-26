import { createPushNotificationDeliveryPlan, describePushNotificationPlatform } from '../foundation/push-notifications.mjs';

export const WEB_PWA_APP_ID = '/app/';
export const WEB_PWA_PRODUCT_NAME = 'Teleton Client';
export const WEB_PWA_SHORT_NAME = 'Teleton';
export const WEB_PWA_MANIFEST_PATH = 'web/manifest.webmanifest';
export const WEB_PWA_SERVICE_WORKER_PATH = 'web/service-worker.js';
export const WEB_PWA_OFFLINE_SHELL_PATH = 'web/offline.html';
export const WEB_PWA_REQUIRED_ICON_SIZES = Object.freeze(['192x192', '512x512']);

export const WEB_PWA_WRAPPER_STACK = deepFreeze({
  platform: 'web',
  runtime: 'browser',
  language: 'javascript',
  uiToolkit: 'web',
  buildSystem: 'static-assets',
  appId: 'dev.teleton.client.web',
  productName: WEB_PWA_PRODUCT_NAME,
  manifestPath: WEB_PWA_MANIFEST_PATH,
  serviceWorkerEntry: WEB_PWA_SERVICE_WORKER_PATH,
  offlineShellEntry: WEB_PWA_OFFLINE_SHELL_PATH,
  minimumOrigin: 'https-or-localhost',
  sharedIntegrations: ['tdlib', 'settings', 'agent', 'proxy', 'ton']
});

const WEB_PWA_ICONS = deepFreeze([
  {
    src: '/icons/icon-192.png',
    sizes: '192x192',
    type: 'image/png',
    purpose: 'any'
  },
  {
    src: '/icons/icon-512.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'any maskable'
  }
]);

const WEB_PWA_SHORTCUTS = deepFreeze([
  {
    name: 'Chats',
    short_name: 'Chats',
    description: 'Open messaging',
    url: '/app/?view=chats',
    icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
  },
  {
    name: 'Agent',
    short_name: 'Agent',
    description: 'Open Teleton Agent controls',
    url: '/app/?view=agent',
    icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
  },
  {
    name: 'Wallet',
    short_name: 'Wallet',
    description: 'Open TON wallet',
    url: '/app/?view=wallet',
    icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
  }
]);

export const WEB_PWA_MANIFEST = deepFreeze({
  id: WEB_PWA_APP_ID,
  name: WEB_PWA_PRODUCT_NAME,
  short_name: WEB_PWA_SHORT_NAME,
  description: 'Installable Teleton Client web shell for messaging, agent review, settings, proxy, and TON workflows.',
  lang: 'en',
  dir: 'ltr',
  start_url: WEB_PWA_APP_ID,
  scope: '/',
  display: 'standalone',
  display_override: ['standalone', 'minimal-ui', 'browser'],
  orientation: 'any',
  theme_color: '#1f7a8c',
  background_color: '#f7fafc',
  categories: ['social', 'productivity', 'utilities'],
  prefer_related_applications: false,
  icons: WEB_PWA_ICONS,
  shortcuts: WEB_PWA_SHORTCUTS
});

const DEFAULT_ORIGIN = 'https://client.teleton.dev';
const DEFAULT_PRECACHE_ASSETS = Object.freeze([
  '/app/',
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
]);

const WEB_BROWSER_SUPPORT = deepFreeze({
  installability: {
    primary: 'manifest-plus-service-worker-on-secure-origin',
    fallback: 'browser-tab',
    secureOriginRequired: true,
    supportedEnvironments: [
      'Chromium desktop and Android with web app manifest support',
      'Safari on iOS 16.4 or later through Share menu installation',
      'Safari on macOS 17 or later through Add to Dock'
    ]
  },
  tdlib: {
    primary: 'trusted-backend-or-native-host-bridge',
    fallback: 'connection-disabled-with-explainer',
    unsupportedInBrowser: ['raw TDLib credentials', 'native TDLib shared libraries', 'local filesystem session cache'],
    requiredBoundary: 'Use a trusted backend, native host, or platform wrapper bridge that keeps Telegram credentials out of browser JavaScript.'
  },
  agentIpc: {
    primary: 'service-worker-message-channel-or-native-host',
    fallback: 'agent-disabled-until-user-configures-supported-bridge',
    supportedTransports: ['postMessage', 'BroadcastChannel', 'WebSocket-to-local-host-when-user-installed'],
    restrictions: ['No arbitrary localhost probing', 'No local agent auto-start from browser-only code']
  },
  notifications: {
    primary: 'Notifications-plus-Push-API',
    permission: 'user-prompt',
    fallback: 'in-app-badges-and-foreground-polling',
    lockScreenRedactionRequired: true,
    requiresServiceWorker: true
  },
  secureStorage: {
    primary: 'IndexedDB-plus-WebCrypto-non-extractable-keys',
    fallback: 'session-only-and-reauthenticate',
    secretStorage: 'secure-references-only',
    restrictions: ['Do not persist Telegram API hashes, agent tokens, proxy passwords, or TON wallet secrets in cleartext.']
  },
  backgroundSync: {
    primary: 'service-worker-background-sync-when-supported',
    fallback: 'sync-on-next-foreground-open',
    restrictions: ['Background sync is best-effort and cannot be required for message send or wallet signing completion.']
  }
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

function normalizeBuildId(value) {
  const buildId = String(value ?? 'local-debug').trim();

  if (!/^[A-Za-z0-9._-]+$/.test(buildId)) {
    throw new Error(`Web PWA build id must contain only letters, numbers, dots, underscores, or hyphens: ${value}`);
  }

  return buildId;
}

function normalizeManifest(input = WEB_PWA_MANIFEST) {
  if (!isPlainObject(input)) {
    throw new Error('Web app manifest must be an object.');
  }

  return input;
}

function normalizeServiceWorker(input = {}) {
  return Array.isArray(input.precacheAssets) ? input : createWebPwaServiceWorkerPlan(input);
}

function iconSupportsSize(icon, size) {
  const sizes = String(icon?.sizes ?? '').split(/\s+/).filter(Boolean);
  return sizes.includes(size) && String(icon?.type ?? '').toLowerCase() === 'image/png';
}

function findIconForSize(manifest, size) {
  return Array.isArray(manifest.icons) ? manifest.icons.find((icon) => iconSupportsSize(icon, size)) : null;
}

function isInstallableOrigin(value) {
  let url;
  try {
    url = new URL(String(value ?? DEFAULT_ORIGIN));
  } catch {
    return false;
  }

  if (url.protocol === 'https:') {
    return true;
  }

  if (url.protocol !== 'http:') {
    return false;
  }

  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

function requirement(id, passed, details) {
  return {
    id,
    passed,
    details
  };
}

function uniqueRequirements(requirements) {
  const seen = new Set();

  return requirements.filter((entry) => {
    if (seen.has(entry.id)) {
      return false;
    }

    seen.add(entry.id);
    return true;
  });
}

function manifestRequirements(manifest, origin, serviceWorker) {
  return [
    requirement(
      'manifest_name_or_short_name',
      Boolean(String(manifest.name ?? manifest.short_name ?? '').trim()),
      'Manifest must provide name or short_name.'
    ),
    ...WEB_PWA_REQUIRED_ICON_SIZES.map((size) =>
      requirement(
        `manifest_icon_${size}_missing`,
        Boolean(findIconForSize(manifest, size)),
        `Manifest icons must include a ${size} PNG icon.`
      )
    ),
    requirement('manifest_start_url', Boolean(String(manifest.start_url ?? '').trim()), 'Manifest must provide start_url.'),
    requirement(
      'manifest_display',
      Boolean(String(manifest.display ?? '').trim()) || Array.isArray(manifest.display_override),
      'Manifest must provide display or display_override.'
    ),
    requirement(
      'prefer_related_applications_false',
      manifest.prefer_related_applications !== true,
      'Manifest must not prefer related native applications over the PWA.'
    ),
    requirement(
      'origin_must_be_https_or_localhost',
      isInstallableOrigin(origin),
      'PWA must be served from HTTPS, localhost, or loopback.'
    ),
    requirement(
      'service_worker_scope',
      serviceWorker.scope === '/' && serviceWorker.secureContextRequired === true,
      'Service worker must use the root scope on a secure context.'
    )
  ];
}

export function createWebAppManifest(overrides = {}) {
  return clone({
    ...WEB_PWA_MANIFEST,
    ...overrides,
    icons: overrides.icons ? clone(overrides.icons) : clone(WEB_PWA_MANIFEST.icons),
    shortcuts: overrides.shortcuts ? clone(overrides.shortcuts) : clone(WEB_PWA_MANIFEST.shortcuts)
  });
}

export function createWebPwaServiceWorkerPlan(options = {}) {
  const buildId = normalizeBuildId(options.buildId ?? 'local-debug');
  const precacheAssets = options.precacheAssets ? [...options.precacheAssets] : [...DEFAULT_PRECACHE_ASSETS];

  return {
    platform: 'web',
    path: options.path ?? WEB_PWA_SERVICE_WORKER_PATH,
    scope: '/',
    scriptUrl: '/service-worker.js',
    secureContextRequired: true,
    registration: {
      api: 'navigator.serviceWorker.register',
      scriptUrl: '/service-worker.js',
      options: {
        scope: '/'
      }
    },
    cacheNames: {
      shell: `teleton-shell-${buildId}`,
      runtime: `teleton-runtime-${buildId}`
    },
    precacheAssets,
    navigationFallback: '/offline.html',
    runtimeCaching: {
      shell: {
        strategy: 'cache-first',
        assets: precacheAssets
      },
      navigation: {
        strategy: 'network-first-with-offline-fallback',
        fallback: '/offline.html'
      },
      api: {
        strategy: 'network-only',
        reason: 'Shared TDLib, agent, proxy, and TON API responses may contain private user data.'
      },
      privateMedia: {
        strategy: 'network-only',
        reason: 'Telegram media, prompts, wallet data, and proxy diagnostics must not be persisted by the shell cache.'
      }
    },
    updateBehavior: {
      check: 'on-launch-and-visibilitychange',
      activation: 'prompt-before-reload',
      cleanup: 'delete-older-teleton-caches',
      notifyClients: true
    }
  };
}

export function createWebOfflineShellValidation(input = {}) {
  const serviceWorker = normalizeServiceWorker(input);
  const precacheAssets = new Set(serviceWorker.precacheAssets);
  const checks = [
    requirement('start_url_precached', precacheAssets.has('/app/'), 'Start URL must be available offline.'),
    requirement('offline_shell_precached', precacheAssets.has('/offline.html'), 'Offline shell must be precached.'),
    requirement('manifest_precached', precacheAssets.has('/manifest.webmanifest'), 'Manifest must be precached.'),
    requirement(
      'required_icons_precached',
      WEB_PWA_REQUIRED_ICON_SIZES.every((size) => precacheAssets.has(`/icons/icon-${size.split('x')[0]}.png`)),
      'Required install icons must be precached.'
    ),
    requirement(
      'navigation_fallback_configured',
      serviceWorker.runtimeCaching.navigation?.fallback === serviceWorker.navigationFallback,
      'Navigation requests must fall back to the offline shell.'
    ),
    requirement(
      'private_requests_network_only',
      serviceWorker.runtimeCaching.api?.strategy === 'network-only' &&
        serviceWorker.runtimeCaching.privateMedia?.strategy === 'network-only',
      'Private API and media responses must not be cached by the shell strategy.'
    ),
    requirement(
      'updates_prompt_before_reload',
      serviceWorker.updateBehavior.activation === 'prompt-before-reload',
      'New service worker versions must prompt before reloading open clients.'
    )
  ];
  const failures = checks.filter((check) => !check.passed).map((check) => check.id);

  return {
    platform: 'web',
    valid: failures.length === 0,
    checks,
    failures
  };
}

export function validateWebPwaAssets(options = {}) {
  const manifest = normalizeManifest(options.manifest ?? WEB_PWA_MANIFEST);
  const serviceWorker = normalizeServiceWorker(options.serviceWorker ?? {});
  const availableAssets = new Set(options.assetPaths ?? serviceWorker.precacheAssets);
  const failures = [];

  for (const size of WEB_PWA_REQUIRED_ICON_SIZES) {
    const icon = findIconForSize(manifest, size);

    if (!icon) {
      failures.push(`manifest_icon_${size}_missing`);
      continue;
    }

    if (!availableAssets.has(icon.src)) {
      failures.push(`asset_${icon.src}_missing`);
    }
  }

  for (const asset of [manifest.start_url, serviceWorker.navigationFallback, '/manifest.webmanifest']) {
    if (!availableAssets.has(asset)) {
      failures.push(`asset_${asset}_missing`);
    }
  }

  return {
    platform: 'web',
    valid: failures.length === 0,
    requiredIconSizes: [...WEB_PWA_REQUIRED_ICON_SIZES],
    checkedAssets: [...availableAssets],
    failures
  };
}

export function createWebPwaInstallabilityReport(options = {}) {
  const manifest = normalizeManifest(options.manifest ?? WEB_PWA_MANIFEST);
  const serviceWorker = normalizeServiceWorker(options.serviceWorker ?? {});
  const origin = String(options.origin ?? DEFAULT_ORIGIN);
  const requirements = manifestRequirements(manifest, origin, serviceWorker);
  const assetValidation = validateWebPwaAssets({
    manifest,
    serviceWorker,
    assetPaths: options.assetPaths
  });
  const assetRequirements = assetValidation.failures.map((failure) =>
    requirement(failure, false, 'PWA asset validation failed.')
  );
  const allRequirements = uniqueRequirements([...requirements, ...assetRequirements]);
  const failures = allRequirements.filter((entry) => !entry.passed).map((entry) => entry.id);

  return {
    platform: 'web',
    installable: failures.length === 0,
    origin,
    secureOrigin: {
      required: true,
      localhostAllowed: true,
      valid: isInstallableOrigin(origin)
    },
    manifest: {
      path: WEB_PWA_MANIFEST_PATH,
      id: manifest.id,
      startUrl: manifest.start_url,
      scope: manifest.scope,
      display: manifest.display,
      iconSizes: Array.isArray(manifest.icons) ? manifest.icons.map((icon) => icon.sizes) : []
    },
    serviceWorker: {
      path: serviceWorker.path,
      scope: serviceWorker.scope,
      navigationFallback: serviceWorker.navigationFallback
    },
    requirements: allRequirements,
    failures
  };
}

export function describeWebBrowserSupport() {
  return clone(WEB_BROWSER_SUPPORT);
}

export function createWebPushNotificationPlan(notification, options = {}) {
  const delivery = createPushNotificationDeliveryPlan(notification, {
    ...options,
    platform: 'web'
  });

  if (!delivery.deliver) {
    return delivery;
  }

  const category = delivery.categoryCapability;
  const pushNotification = delivery.notification;
  const data = {
    notificationId: pushNotification.id,
    category: pushNotification.category,
    route: category.route,
    payload: clone(pushNotification.payload)
  };

  return {
    ...delivery,
    request: {
      platform: 'web',
      api: 'ServiceWorkerRegistration.showNotification',
      permission: 'Notification.permission',
      serviceWorkerPath: WEB_PWA_SERVICE_WORKER_PATH,
      notificationId: pushNotification.id,
      title: pushNotification.title,
      options: {
        body: pushNotification.lockScreenBody,
        tag: `${category.id}.${pushNotification.id}`,
        requireInteraction: category.requireInteraction === true,
        data
      },
      data
    }
  };
}

export function describeWebPwaWrapper() {
  const serviceWorker = createWebPwaServiceWorkerPlan();

  return {
    stack: clone(WEB_PWA_WRAPPER_STACK),
    manifest: createWebAppManifest(),
    serviceWorker,
    installability: createWebPwaInstallabilityReport({ serviceWorker }),
    offlineShell: createWebOfflineShellValidation(serviceWorker),
    browserSupport: describeWebBrowserSupport(),
    pushNotifications: describePushNotificationPlatform('web'),
    assets: validateWebPwaAssets({ serviceWorker })
  };
}
