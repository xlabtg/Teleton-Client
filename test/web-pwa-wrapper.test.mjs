import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  WEB_PWA_REQUIRED_ICON_SIZES,
  WEB_PWA_WRAPPER_STACK,
  createWebAppManifest,
  createWebOfflineShellValidation,
  createWebPwaInstallabilityReport,
  createWebPwaServiceWorkerPlan,
  describeWebBrowserSupport,
  describeWebPwaWrapper,
  validateWebPwaAssets
} from '../src/platform/web-pwa-wrapper.mjs';

const root = new URL('../', import.meta.url);

function pathFor(relativePath) {
  return new URL(relativePath, root);
}

test('web PWA wrapper selects a browser stack and installable manifest contract', () => {
  const wrapper = describeWebPwaWrapper();
  const manifest = createWebAppManifest();
  const installability = createWebPwaInstallabilityReport();

  assert.equal(WEB_PWA_WRAPPER_STACK.platform, 'web');
  assert.equal(wrapper.stack.runtime, 'browser');
  assert.equal(wrapper.stack.uiToolkit, 'web');
  assert.equal(wrapper.stack.buildSystem, 'static-assets');
  assert.deepEqual(wrapper.stack.sharedIntegrations, ['tdlib', 'settings', 'agent', 'proxy', 'ton']);

  assert.equal(manifest.name, 'Teleton Client');
  assert.equal(manifest.short_name, 'Teleton');
  assert.equal(manifest.id, '/app/');
  assert.equal(manifest.start_url, '/app/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.prefer_related_applications, false);
  assert.deepEqual(WEB_PWA_REQUIRED_ICON_SIZES, ['192x192', '512x512']);

  for (const size of WEB_PWA_REQUIRED_ICON_SIZES) {
    assert.ok(manifest.icons.some((icon) => icon.sizes === size && icon.type === 'image/png'));
  }

  assert.equal(installability.installable, true);
  assert.deepEqual(installability.failures, []);
  assert.ok(installability.requirements.every((requirement) => requirement.passed));
});

test('web service worker strategy validates the offline shell and safe update behavior', () => {
  const serviceWorker = createWebPwaServiceWorkerPlan({ buildId: 'local-debug-1' });
  const offlineShell = createWebOfflineShellValidation(serviceWorker);

  assert.equal(serviceWorker.path, 'web/service-worker.js');
  assert.equal(serviceWorker.scope, '/');
  assert.equal(serviceWorker.secureContextRequired, true);
  assert.equal(serviceWorker.navigationFallback, '/offline.html');
  assert.equal(serviceWorker.cacheNames.shell, 'teleton-shell-local-debug-1');
  assert.deepEqual(serviceWorker.precacheAssets, [
    '/app/',
    '/offline.html',
    '/manifest.webmanifest',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
  ]);
  assert.equal(serviceWorker.runtimeCaching.api.strategy, 'network-only');
  assert.equal(serviceWorker.runtimeCaching.privateMedia.strategy, 'network-only');
  assert.equal(serviceWorker.updateBehavior.check, 'on-launch-and-visibilitychange');
  assert.equal(serviceWorker.updateBehavior.activation, 'prompt-before-reload');
  assert.equal(serviceWorker.updateBehavior.cleanup, 'delete-older-teleton-caches');

  assert.equal(offlineShell.valid, true);
  assert.deepEqual(offlineShell.failures, []);
  assert.ok(offlineShell.checks.every((check) => check.passed));
});

test('web browser support documents progressive fallbacks for native-only capabilities', () => {
  const support = describeWebBrowserSupport();

  assert.equal(support.installability.fallback, 'browser-tab');
  assert.equal(support.tdlib.primary, 'trusted-backend-or-native-host-bridge');
  assert.equal(support.tdlib.fallback, 'connection-disabled-with-explainer');
  assert.equal(support.agentIpc.primary, 'service-worker-message-channel-or-native-host');
  assert.equal(support.agentIpc.fallback, 'agent-disabled-until-user-configures-supported-bridge');
  assert.equal(support.notifications.permission, 'user-prompt');
  assert.equal(support.notifications.fallback, 'in-app-badges-and-foreground-polling');
  assert.equal(support.secureStorage.primary, 'IndexedDB-plus-WebCrypto-non-extractable-keys');
  assert.equal(support.secureStorage.fallback, 'session-only-and-reauthenticate');
});

test('web PWA validation rejects missing installability requirements', () => {
  const assets = validateWebPwaAssets();
  const invalid = createWebPwaInstallabilityReport({
    origin: 'http://example.com',
    manifest: createWebAppManifest({
      icons: [
        {
          src: '/icons/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any'
        }
      ]
    })
  });

  assert.equal(assets.valid, true);
  assert.deepEqual(assets.requiredIconSizes, WEB_PWA_REQUIRED_ICON_SIZES);
  assert.deepEqual(assets.failures, []);

  assert.equal(invalid.installable, false);
  assert.ok(invalid.failures.includes('origin_must_be_https_or_localhost'));
  assert.ok(invalid.failures.includes('manifest_icon_512x512_missing'));
});

test('web PWA docs cover manifest, service worker, and browser support constraints', async () => {
  const readme = await readFile(pathFor('README.md'), 'utf8');
  const architecture = await readFile(pathFor('docs/architecture.md'), 'utf8');
  const buildGuide = await readFile(pathFor('BUILD-GUIDE.md'), 'utf8');
  const webGuide = await readFile(pathFor('docs/web-pwa-wrapper.md'), 'utf8');

  assert.match(readme, /PWA wrapper contract/i);
  assert.match(architecture, /Web PWA wrapper/i);
  assert.match(buildGuide, /web\/service-worker\.js/i);
  assert.match(webGuide, /web app manifest/i);
  assert.match(webGuide, /service worker/i);
  assert.match(webGuide, /offline shell/i);
  assert.match(webGuide, /TDLib/i);
  assert.match(webGuide, /secure storage/i);
});
