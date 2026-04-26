# iOS Wrapper

The iOS wrapper contract selects a Swift runtime with SwiftUI UI, the Xcode build system, and bundle identifier `dev.teleton.client`. The debug simulator variant is represented by the runnable app bundle contract `ios/build/Build/Products/Debug-iphonesimulator/TeletonClient.app`, launched through the `TeletonClient` scheme and `TeletonClientApp` entry point.

This repository still keeps the implementation dependency-free, so the wrapper is modeled as a shared contract that future native Xcode sources can consume. The contract records the selected stack, runnable debug artifact metadata, Keychain-backed secret references, APNs notification requests, BGTaskScheduler boundaries, URL scheme and Universal Link routing, and App Store review constraints for messaging, AI automation, and crypto behavior.

## Keychain

iOS secrets are represented only as Keychain references. Shared code never receives raw Telegram API hashes, proxy credentials, agent tokens, TON wallet keys, mnemonics, or seed phrases.

The wrapper uses Keychain Services with app access group `dev.teleton.client`, generic-password items, `ThisDeviceOnly` accessibility classes, and `synchronizable: false` so secrets do not move into iCloud Keychain by default.

Default Keychain purposes include:

- `tdlib.credentials` for Telegram API and session credential references.
- `agent.memory-key` for the local Teleton Agent memory encryption data key.
- `agent.local-token` for local agent IPC or runtime tokens.
- `proxy.credentials` for MTProto and SOCKS5 proxy secret references.
- `ton.wallet` for TON wallet provider or signing references, requiring user presence and biometric set binding.

TON wallet signing material must remain behind a wallet provider or a Keychain item protected with user presence. The shared TON adapters still prepare unsigned drafts and require confirmation before signing or broadcasting.

## Push Notifications

iOS push requests are generated from shared notification payloads through `UNUserNotificationCenter` and APNs. The wrapper maps user-visible categories to redacted iOS notification categories:

- `MESSAGES` for Telegram message events.
- `AGENT_ACTION_REVIEW` for approval-required Teleton Agent action events.
- `AGENT_RUNTIME_STATUS` for local agent runtime status.
- `WALLET_STATUS` for TON wallet and transaction status events.

APNs payloads use the `alert` push type and the app topic `dev.teleton.client`. Approval-required agent actions use the `time-sensitive` interruption level because they block agent progress until the user responds. Informational notifications respect the shared notification settings.

Notification `userInfo` carries sanitized routing metadata only. Message text, chat titles, sender names, prompts, context, proxy credentials, wallet secrets, and raw tokens are removed before dispatch.

The shared push notification delivery plan applies message, agent approval, and wallet category preferences before APNs request creation. `UNUserNotificationCenter` permission states are explicit: prompt states request notification permission, denied states route users to platform notification settings, and unsupported states fall back to in-app notification surfaces.

## Background Tasks

iOS background work is system-managed and cannot assume indefinite execution.

Local agent runtime work is modeled as a `BGProcessingTask` with identifier `dev.teleton.client.agent.runtime`. It can run only when the system allows it and when the user has enabled the local agent. Its expiration path stops active work, persists resumable state, and asks the user to resume when foreground interaction is required.

Message synchronization is modeled as a `BGAppRefreshTask` with identifier `dev.teleton.client.message.sync`. It can be triggered by APNs `content-available` pushes and requires network connectivity. Expiration persists the last sync cursor and reschedules later work.

TON status refresh is modeled as a `BGAppRefreshTask` with identifier `dev.teleton.client.ton.status-refresh`. It requires network connectivity, does not sign transactions, and does not require user-initiated refresh for passive status updates.

Native Xcode sources must declare matching `BGTaskSchedulerPermittedIdentifiers` and background modes before App Store submission.

## Deep Links

The iOS wrapper supports the schemes `teleton`, `tg`, `ton`, and `https`. Custom URL schemes enter through SwiftUI scene URL handling, while `https://t.me` and `https://telegram.me` are modeled as Universal Links.

Supported Telegram routes include:

- `tg://resolve?domain=teleton` to `messaging.openChat`.
- `tg://resolve?domain=teleton&post=42` to `messaging.openMessage`.
- `https://t.me/teleton/42` to `messaging.openMessage`.

Supported TON routes include:

- `ton://transfer/EQExampleAddress?amount=1000&text=coffee` to `ton.transfer.review`.
- `ton://dns/example.ton` to `ton.dns.resolve`.

All TON transfer links route to a review workflow with `requiresConfirmation: true`; the wrapper contract never treats a link as authorization to sign or broadcast a transaction.

## App Store Review

Compliance review is required before store submission because this wrapper combines messaging, AI automation, background processing, and crypto-adjacent wallet behavior.

Review notes captured by the contract:

- Messaging behavior must stay user-controlled and avoid spam-like automation.
- AI automation must disclose local or cloud processing and require explicit user confirmation before sending messages, changing settings, or taking irreversible actions.
- TON wallet behavior must keep no raw private keys in shared code or logs, use wallet-provider or Keychain references, and require confirmation before signing or broadcasting.
- Background execution must use APNs and BGTaskScheduler instead of indefinite background execution.

Human review should confirm the native entitlements, APNs payload shape, background task identifiers, App Store metadata, and crypto feature disclosures before release submission.
