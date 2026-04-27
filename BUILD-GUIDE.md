# Build Guide

Teleton Client is currently in the repository foundation phase. The present codebase provides the issue decomposition workflow, validation scripts, and small shared configuration models that future platform implementations will build on.

## Requirements

- Node.js 20 or newer.
- GitHub CLI (`gh`) for creating GitHub issues from the epic backlog.
- A GitHub account with write access to `xlabtg/Teleton-Client` when running issue creation.

## TDLib Build Targets

The current repository does not compile TDLib yet. The baseline adapter boundary in `src/tdlib/client-adapter.mjs` defines the platform-neutral contract that future native builds must implement for Android, iOS, desktop, and web-compatible callers.

Future TDLib build work should produce:

- Android native artifacts for supported NDK ABIs.
- iOS device and simulator artifacts packaged for the app wrapper.
- desktop artifacts for Linux, macOS, and Windows through a native module or helper process.
- a web-compatible bridge that calls a trusted local service or backend instead of shipping raw TDLib credentials into a browser runtime.

TDLib is distributed under the Boost Software License 1.0 (`BSL-1.0`). Future build scripts must preserve upstream license notices, record the TDLib source revision, and document local patches or packaging changes. See `docs/tdlib-adapter.md` for the adapter boundary and credential-handling rules.

See `docs/license-matrix.md` for the current upstream license matrix covering TDLib, Telegram reference clients, Teleton Agent, TON SDKs, copyleft boundaries, source publication obligations, and human legal review requirements before release readiness.

## Android Wrapper

The Android wrapper contract in `src/platform/android-wrapper.mjs` selects Kotlin, Jetpack Compose, and the Gradle Android Plugin for the future native shell. The debug artifact contract is an installable APK at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

The contract declares package `dev.teleton.client`, entry activity `dev.teleton.client.MainActivity`, Android notification channels, WorkManager jobs for message and TON synchronization, an app-private foreground service for the local Teleton Agent runtime, shared gesture bindings for messaging, agent, and wallet workflows, and deep-link routing for Telegram and TON flows. See `docs/android-wrapper.md` for the platform API mapping.

## iOS Wrapper

The iOS wrapper contract in `src/platform/ios-wrapper.mjs` selects Swift, SwiftUI, and Xcode for the future native shell. The debug simulator artifact contract is a runnable app bundle at:

```text
ios/build/Build/Products/Debug-iphonesimulator/TeletonClient.app
```

The contract declares bundle identifier `dev.teleton.client`, app target and scheme `TeletonClient`, Keychain Services references for TDLib credentials, agent memory keys, proxy credentials, and TON wallet references, APNs notification request mapping, BGTaskScheduler jobs for agent runtime, message sync, and TON status refresh, shared gesture bindings for messaging, agent, and wallet workflows, and URL scheme or Universal Link routing for Telegram and TON flows. See `docs/ios-wrapper.md` for the platform API mapping and App Store review constraints.

## Desktop Wrapper

The desktop wrapper contract in `src/platform/desktop-wrapper.mjs` selects Electron, an isolated preload bridge, a web renderer, and electron-builder for the future desktop shell. Debug artifact contracts are runnable local outputs at:

```text
desktop/out/debug/macos-x64/Teleton Client.app
desktop/out/debug/windows-x64/Teleton Client.exe
desktop/out/debug/linux-x64/teleton-client
```

The contract declares app id `dev.teleton.client`, product name `Teleton Client`, tray menu actions, system notification mapping, focused-window and opt-in global shortcuts from the shared input action map, launch-at-login configuration for macOS, Windows, and Linux, protocol routing for Telegram and TON flows, and release packaging targets for DMG, EXE, and AppImage. See `docs/desktop-wrapper.md` for the desktop API mapping and packaging plan.

## Release Packaging

The release artifact matrix in `src/foundation/release-artifacts.mjs` covers Android APK, iOS IPA, macOS DMG, Windows EXE, and Linux AppImage release targets. Public CI builds unsigned debug artifact manifests for Android, iOS, macOS, Windows, and Linux with:

```sh
npm run build:debug-artifacts
```

The generated manifests are written to `dist/debug-artifacts/` and are uploaded by `.github/workflows/release-validation.yml`. They record the expected debug artifact paths without using signing secrets. Signed packages must be produced only in the protected `release-signing` environment after human release review. See `docs/release-packaging.md` for the artifact matrix, signing boundary, and publication steps.

## Input Action Map

The shared input action map in `src/platform/action-map.mjs` defines common messaging, Teleton Agent, and TON wallet routes once, then adapts them to desktop shortcuts and mobile gestures. The generated plans include collision reports, reserved mobile system gesture notes, accessibility requirements, and `input.riskyActionBindings.enabled` so risky agent or transaction bindings can be disabled without removing visible workflow controls.

## Web PWA Wrapper

The web PWA wrapper contract in `src/platform/web-pwa-wrapper.mjs` selects a browser runtime, static asset build boundary, and installable manifest metadata for the future web shell. Reserved deployable asset paths are:

```text
web/manifest.webmanifest
web/service-worker.js
web/offline.html
```

The contract declares manifest id and start URL `/app/`, root scope `/`, standalone display mode, 192 x 192 and 512 x 512 PNG icon metadata, service worker precache assets, offline navigation fallback, prompt-before-reload update activation, and network-only caching for private API and media requests. It also documents browser fallbacks for TDLib, Teleton Agent IPC, notifications, background sync, and secure storage. See `docs/web-pwa-wrapper.md` for the installability and browser support constraints.

## Tablet Layout

The tablet layout contract in `src/platform/tablet-layout.mjs` defines dependency-free responsive rules that Android, iOS, desktop, and web shells can consume while rendering native controls. It classifies tablet viewports from a 600 px short edge through a 1366 px long edge, uses bottom navigation in portrait, uses a navigation rail in landscape, and returns non-overlapping pane frames for chats, settings, agent, and wallet views.

The layout tests cover representative 768 x 1024 portrait, 1180 x 820 landscape, and 600 x 960 narrow-tablet viewports. See `docs/tablet-layout.md` for the breakpoint, navigation, and pane behavior.

## Local Checks

Run the same checks used by CI:

```sh
npm test
npm run validate:secrets
npm run audit:security
npm run validate:foundation
npm run validate:release
npm run build:debug-artifacts
npm run decompose:dry-run
```

No dependency installation is required for the current foundation package because it uses only Node.js built-ins.

## Pre-commit Checks

Enable the repository hook path once per clone:

```sh
npm run prepare:hooks
```

The pre-commit hook runs the same foundation checks as CI before allowing a commit.

## Release Metadata

`package.json` is the only version source of truth for the current package, application, and release metadata. Run `npm run validate:release` before changing release metadata so CI can verify stable semantic version format and consistency with `src/foundation/release-metadata.mjs`.

Run `npm run build:debug-artifacts` before release packaging changes so CI can verify the public debug artifact matrix without accessing signing credentials.

## Epic Decomposition

Preview the planned subissues without changing GitHub:

```sh
npm run decompose:dry-run
```

Create issues in a repository after reviewing the dry run:

```sh
node scripts/decompose-epic.mjs --create --repo xlabtg/Teleton-Client
```

The script creates any missing labels, skips issues with duplicate titles, and preserves the priority order declared in `config/epic-subtasks.json`. Creating labels and issues requires write access to the target repository. If labels are already prepared but the token cannot create labels, use:

```sh
node scripts/decompose-epic.mjs --create --skip-label-create --repo xlabtg/Teleton-Client
```

## Environment

Do not hardcode Telegram API credentials, proxy secrets, TON wallet secrets, cloud model tokens, or agent keys in source files. Use environment variables or platform secure storage references such as `env:TELETON_MTPROTO_SECRET`, `keychain:teleton-agent-token`, or `keystore:ton-wallet`.

Run `npm run validate:secrets` to scan git-tracked files for high-confidence secret patterns before committing or opening a pull request. The command redacts suspected values in output and allows only narrow synthetic fixtures used by redaction tests.

Use `docs/security-audit.md` as the credential inventory and rotation source of truth. It records Telegram, proxy, LLM provider, TON, agent memory, settings sync, and CI credential handling; platform secure storage review requirements; and the human security review required before release.

Run `npm run audit:security -- --output security-audit-report.md` during release preparation. The generated `security-audit-report.md` records automated evidence for secrets, dependency risk, permission boundaries, and release readiness, then lists manual sign-off checkboxes that can be attached to the release review.

Use `SECURITY.md` as the security policy source of truth for supported versions, private vulnerability reporting, coordinated disclosure, and the human maintainer review required before release.

## End-to-End Workflow Checks

`test/e2e-workflow-harness.test.mjs` runs the shared auth, messaging, agent reply, and TON transaction workflow harness in mock mode by default. Local validation does not need production Telegram accounts, agent transports, TON wallet providers, or network access.

Protected CI or a trusted local shell can opt into live workflow checks only when all required variables are present:

| Variable | Required for live E2E | Secret | Purpose |
| --- | --- | --- | --- |
| `TELETON_E2E_LIVE_ENABLED` | yes | no | Set to `true` to enable live E2E checks. Any other value keeps mock mode. |
| `TELETON_E2E_TDLIB_API_ID_REF` | yes | yes | Secure reference for the Telegram API id. |
| `TELETON_E2E_TDLIB_API_HASH_REF` | yes | yes | Secure reference for the Telegram API hash. |
| `TELETON_E2E_TDLIB_PHONE_NUMBER_REF` | yes | yes | Secure reference for the Telegram phone number. |
| `TELETON_E2E_AGENT_TRANSPORT_REF` | yes | yes | Secure reference for the protected Teleton Agent transport. |
| `TELETON_E2E_TON_WALLET_ADDRESS` | yes | no | Public TON wallet address for transaction draft checks. |
| `TELETON_E2E_TON_PROVIDER_REF` | yes | yes | Secure wallet provider reference for TON checks. |
| `TELETON_E2E_TON_RECIPIENT_ADDRESS` | yes | no | Public TON recipient address for draft checks. |
| `TELETON_E2E_TON_TRANSFER_NANOTON` | no | no | Optional positive integer draft amount. Defaults to the mock fixture amount locally. |

Failure artifacts are sanitized before they leave the harness. Logs redact secure references and private message fields, and screenshots are attached only when a platform capture hook is explicitly supplied.

## TON Testnet Checks

`test/ton-testnet-coverage.test.mjs` runs the TON wallet flow harness in mock mode by default, so local validation never needs wallet secrets or network access. Protected CI can opt into live testnet checks only when all required variables are present:

| Variable | Required for live testnet | Secret | Purpose |
| --- | --- | --- | --- |
| `TELETON_TON_TESTNET_ENABLED` | yes | no | Set to `true` to enable live testnet checks. Any other value keeps mock mode. |
| `TELETON_TON_TESTNET_WALLET_ADDRESS` | yes | no | Public testnet wallet address used for balance and receive-address checks. |
| `TELETON_TON_TESTNET_PROVIDER_REF` | yes | yes | Secure provider reference resolved by protected CI or a platform wallet bridge. Do not store raw private keys, mnemonics, or seed phrases. |
| `TELETON_TON_TESTNET_RECIPIENT_ADDRESS` | yes | no | Public testnet recipient address used for unsigned transfer draft checks. |
| `TELETON_TON_TESTNET_TRANSFER_NANOTON` | no | no | Optional positive integer draft amount. Defaults to `1` nanotON for live checks and a mock fixture amount locally. |

Rotate testnet credentials by creating a fresh testnet wallet/provider outside the repository, funding it only with faucet testnet TON, updating the protected CI secret that backs `TELETON_TON_TESTNET_PROVIDER_REF`, and replacing the public wallet/recipient variables in the protected environment. After rotation, run the protected testnet job once, then revoke or delete the previous provider reference. Never paste wallet provider material into issue comments, pull request descriptions, logs, screenshots, or committed fixtures.
