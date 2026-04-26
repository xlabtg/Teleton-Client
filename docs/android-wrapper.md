# Android Wrapper

The Android wrapper contract selects a Kotlin Android runtime with Jetpack Compose UI, the Gradle Android Plugin build system, and package name `dev.teleton.client`. The debug variant is represented by the installable artifact contract `android/app/build/outputs/apk/debug/app-debug.apk`, launched through `dev.teleton.client.MainActivity`.

This repository still keeps the implementation dependency-free, so the wrapper is modeled as a shared contract that future native Gradle sources can consume. The contract records the selected stack, runnable debug artifact metadata, notification channels, background execution boundaries, gesture bindings from the shared input action map, and deep-link routing into shared messaging, settings, agent, proxy, and TON workflows.

## Notifications

Android notification requests are generated from the shared notification payloads. The platform request uses `NotificationCompat`, declares the Android 13+ `POST_NOTIFICATIONS` runtime permission requirement, and maps user-visible categories to private lock-screen channels:

- `messages` for Telegram message events.
- `agent_actions` for approval-required and informational Teleton Agent action events.
- `agent_runtime` for foreground service status.
- `wallet` for TON wallet and transaction status events.

Lock-screen copy stays redacted, and pending intents carry sanitized payload metadata rather than message text, chat titles, prompts, tokens, or wallet secrets.

The shared push notification model applies category preferences before Android request creation, so users can mute message, agent approval, or wallet categories independently. When `POST_NOTIFICATIONS` is denied or still needs a prompt, the delivery plan reports the platform permission state and recovery action instead of silently dropping the notification.

## Background Work

Long-running local agent execution is modeled as an app-private `ForegroundService` named `dev.teleton.client.agent.TeletonAgentForegroundService`. It is not exported, uses the `agent_runtime` notification channel, declares the `dataSync` foreground service type, and is started only through user-initiated or notification-action flows.

Message synchronization uses `WorkManager` through `dev.teleton.client.sync.MessageSyncWorker`. Expedited work requires foreground info so Android can display the user-visible notification required for expedited or foreground execution.

TON status refresh uses `WorkManager` through `dev.teleton.client.ton.TonStatusRefreshWorker` with connected-network and battery-not-low constraints. It is not expedited because wallet status polling should not consume foreground service quota.

## Gestures

Android gesture metadata is generated from the shared input action map and is intended for Jetpack Compose `pointerInput` or higher-level gesture handlers. Default gestures cover repeated workflows while keeping visible controls as the primary path:

- Pull down from the top of the chat list to search messages.
- Horizontal swipes inside chat content to move to the next or previous chat.
- Long press the agent navigation item to draft an agent quick action for review.
- Long press the wallet navigation item to draft a TON transfer review.

The gesture plan includes a collision report for duplicate gestures in the same context. It also documents Android system back edge swipes as reserved; Teleton chat navigation gestures must start inside content and must not intercept the system back gesture area.

Gesture accessibility requirements match the desktop shortcut contract: every gesture route must also be reachable through visible controls, keyboard navigation where available, and TalkBack actions. Agent quick action and TON transfer gestures are `review-required`, keep explicit confirmation screens, and can be removed through `input.riskyActionBindings.enabled` or per-action disabled ids.

## Hardware Security Keys

Android hardware key support must use the shared capability plan before registration, account protection, or high-risk action prompts are shown. Native sources should expose Credential Manager public-key credential support for passkeys and hardware-backed FIDO authenticators through a platform bridge. If Credential Manager or public-key credentials are unavailable, the wrapper returns the configured fallback behavior rather than attempting a partial authenticator flow.

## Deep Links

`MainActivity` is the single Android deep-link entry point. It uses `android.intent.action.VIEW` with `DEFAULT` and `BROWSABLE` categories for the supported schemes `teleton`, `tg`, `ton`, and verified `https` app links.

Supported Telegram routes include:

- `tg://resolve?domain=teleton` to `messaging.openChat`.
- `tg://resolve?domain=teleton&post=42` to `messaging.openMessage`.
- `https://t.me/teleton/42` to `messaging.openMessage`.

Supported TON routes include:

- `ton://transfer/EQExampleAddress?amount=1000&text=coffee` to `ton.transfer.review`.
- `ton://dns/example.ton` to `ton.dns.resolve`.

All TON transfer deep links route to a review workflow with `requiresConfirmation: true`; the wrapper contract never treats a link as authorization to sign or broadcast a transaction.
