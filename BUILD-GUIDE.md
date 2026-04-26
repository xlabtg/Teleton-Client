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

## Android Wrapper

The Android wrapper contract in `src/platform/android-wrapper.mjs` selects Kotlin, Jetpack Compose, and the Gradle Android Plugin for the future native shell. The debug artifact contract is an installable APK at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

The contract declares package `dev.teleton.client`, entry activity `dev.teleton.client.MainActivity`, Android notification channels, WorkManager jobs for message and TON synchronization, an app-private foreground service for the local Teleton Agent runtime, and deep-link routing for Telegram and TON flows. See `docs/android-wrapper.md` for the platform API mapping.

## iOS Wrapper

The iOS wrapper contract in `src/platform/ios-wrapper.mjs` selects Swift, SwiftUI, and Xcode for the future native shell. The debug simulator artifact contract is a runnable app bundle at:

```text
ios/build/Build/Products/Debug-iphonesimulator/TeletonClient.app
```

The contract declares bundle identifier `dev.teleton.client`, app target and scheme `TeletonClient`, Keychain Services references for TDLib credentials, agent memory keys, proxy credentials, and TON wallet references, APNs notification request mapping, BGTaskScheduler jobs for agent runtime, message sync, and TON status refresh, and URL scheme or Universal Link routing for Telegram and TON flows. See `docs/ios-wrapper.md` for the platform API mapping and App Store review constraints.

## Local Checks

Run the same checks used by CI:

```sh
npm test
npm run validate:foundation
npm run validate:release
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
