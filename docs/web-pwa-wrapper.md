# Web PWA Wrapper

The Web PWA wrapper contract in `src/platform/web-pwa-wrapper.mjs` defines the baseline progressive web app shell for browser environments. It records the installable web app manifest metadata, service worker strategy, offline shell validation, update behavior, and browser-specific fallbacks for TDLib, Teleton Agent IPC, notifications, background sync, and secure storage.

This repository still keeps the implementation dependency-free, so the PWA wrapper is modeled as a shared contract that future web assets can consume. The reserved deployable paths are:

- `web/manifest.webmanifest` for the web app manifest.
- `web/service-worker.js` for the service worker entry.
- `web/offline.html` for the offline shell.
- `/icons/icon-192.png` and `/icons/icon-512.png` for installable app icons.

## Manifest

The manifest contract uses app id and start URL `/app/`, scope `/`, standalone display mode, a stable name of `Teleton Client`, and a short name of `Teleton`. It declares 192 x 192 and 512 x 512 PNG icon assets, with the 512 icon marked for maskable use.

Installability validation checks:

- `name` or `short_name` is present.
- 192 x 192 and 512 x 512 PNG icons are present.
- `start_url` is present.
- `display` or `display_override` is present.
- `prefer_related_applications` is not true.
- The app is served from HTTPS, localhost, or loopback.
- The service worker has root scope and requires a secure context.

The manifest also exposes app shortcuts for chats, agent controls, and the TON wallet so supported launchers can route directly into core workflows.

## Service Worker

The service worker contract reserves `web/service-worker.js` and root scope `/`. It precaches only the offline app shell assets:

- `/app/`
- `/offline.html`
- `/manifest.webmanifest`
- `/icons/icon-192.png`
- `/icons/icon-512.png`

Navigation uses `network-first-with-offline-fallback`, returning `/offline.html` when a fresh shell cannot be fetched. Static shell assets use `cache-first`. Private API responses and private media use `network-only` so Telegram messages, prompts, proxy diagnostics, wallet data, and agent payloads are not persisted by the shell cache.

Update checks run on launch and visibility restoration. New service worker versions use `prompt-before-reload` activation so an installed client does not reload out from under an active chat, agent approval, or wallet review. Activation cleanup removes older Teleton cache names after the user accepts the update.

## Offline Shell

The offline shell is intentionally limited. It can show cached app chrome and explain that live Telegram, agent, proxy, and TON actions require connectivity or a configured bridge. It must not imply that queued sends, agent actions, or wallet signing can complete offline.

The validation helper confirms that the start URL, offline shell, manifest, and required icons are in the precache list; that navigation requests fall back to the offline shell; that private API and media requests are network-only; and that updates prompt before reload.

## Browser Support Constraints

Installability is progressive. Chromium browsers on desktop and Android can promote the manifest-based PWA where installability criteria are met. iOS 16.4 and later can install web apps from the Share menu in supported browsers. macOS Safari 17 and later can add web apps to the Dock. Browsers without PWA installation support fall back to a normal browser tab.

TDLib is not bundled into browser JavaScript. Web callers must use a trusted backend, native host, or platform bridge that keeps Telegram credentials, session caches, and native TDLib libraries out of the browser runtime. Without that bridge, Telegram connectivity stays disabled with an explanatory UI state.

Teleton Agent IPC can use service worker message channels, `BroadcastChannel`, or a user-installed native host bridge where available. Browser-only code must not auto-start a local agent or probe arbitrary localhost ports. Unsupported environments keep agent mode disabled until the user configures a supported bridge.

Notifications use the Notifications API, Push API, and service worker delivery when the user grants permission. Fallback behavior is in-app badges and foreground polling. Lock-screen and serialized notification payloads must stay redacted.

The shared push notification plan maps message, agent approval, and wallet categories to service worker `showNotification` requests only after category preferences and browser permission state pass. The web permission fallback is in-app badges plus foreground polling when notification permission is denied, still pending, or unsupported by the current browser.

Secure storage uses IndexedDB plus WebCrypto non-extractable keys where available. Browser storage remains weaker than OS Keychain or Keystore, so shared code stores only secure references and non-secret metadata. If durable protected storage is unavailable, the web shell falls back to session-only state and reauthentication.

Hardware security key support uses WebAuthn `PublicKeyCredential` only after the page is in a secure context and `navigator.credentials.create()` and `navigator.credentials.get()` can handle public-key credentials. Unsupported browsers must expose the shared fallback state instead of showing a registration or assertion prompt. Challenge creation and verification stay behind server or trusted bridge boundaries, while browser code only performs the authenticator ceremony.

Background sync is best effort. The web shell may request background synchronization where the browser supports it, but queued message sends, agent actions, and wallet signing must reconcile on the next foreground open instead of depending on background execution.
