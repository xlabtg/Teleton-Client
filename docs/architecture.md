# Architecture

Teleton Client is planned as a layered client where protocol, automation, wallet, and UI concerns stay separated.

## Layers

1. Platform UI shells provide Android, iOS, desktop, and web user experiences.
2. Shared foundation models define settings, proxy configuration, agent modes, and validation behavior.
3. TDLib adapters own Telegram authentication, updates, cache, media, and message operations.
4. Connectivity services select direct, MTProto, or SOCKS5 routes based on user settings and health checks.
5. Teleton Agent integration runs locally by default and communicates through a versioned IPC bridge.
6. TON adapters expose wallet, transfer, swap, NFT, staking, and DNS operations behind explicit confirmation flows.
7. Security and privacy controls enforce secure secret references, encryption at rest, and user consent.

## Boundaries

- TDLib credentials must be supplied at runtime and never committed.
- TDLib callers use the shared `authenticate`, `getChatList`, `sendMessage`, and `subscribeUpdates` adapter contract so Android, iOS, desktop, and web-compatible bridges expose the same boundary.
- TDLib two-factor authentication is represented by `src/tdlib/two-factor-auth.mjs`. The controller exposes password-required, recovery-required, ready, failed, and cancelled UI states while keeping password and recovery-code drafts out of shared settings, state snapshots, diagnostics, and logs.
- Local TDLib message database encryption is represented by `src/tdlib/message-database-storage.mjs`. It encrypts cached messages, search indexes, and attachments metadata with AES-256-GCM while platform wrappers keep the raw database key in OS secure storage providers.
- Hardware security key support is represented by `src/foundation/hardware-security-key.mjs`. The shared contract records WebAuthn/FIDO protocols, platform capability checks, registration challenge, platform authenticator, and verification boundaries, high-risk action gating, account protection gates, explicit fallback behavior, and human security review before release enablement.
- The Android wrapper is represented by `src/platform/android-wrapper.mjs`. It selects Kotlin, Jetpack Compose, and the Gradle Android Plugin for the native shell; exposes runnable debug APK artifact metadata; maps notifications and background work to Android channels, WorkManager, and an app-private foreground service; and routes Telegram and TON deep links to shared workflows.
- The iOS wrapper is represented by `src/platform/ios-wrapper.mjs`. It selects Swift, SwiftUI, and Xcode for the native shell; exposes runnable debug simulator app metadata; maps secrets to Keychain Services references, notifications to APNs and `UNUserNotificationCenter`, background work to BGTaskScheduler, and Telegram or TON links to shared workflows; and records App Store compliance notes for messaging, AI automation, and crypto behavior.
- The Desktop wrapper is represented by `src/platform/desktop-wrapper.mjs`. It selects Electron, an isolated preload bridge, a web renderer, and electron-builder for the desktop shell; exposes runnable debug artifact metadata for macOS, Windows, and Linux; maps tray actions, desktop notifications, focused-window shortcuts, opt-in global shortcuts, launch-at-login settings, protocol handlers, and DMG/EXE/AppImage packaging targets to shared workflows.
- The responsive tablet layout is represented by `src/platform/tablet-layout.mjs`. It defines the 600 px to 1366 px tablet viewport contract, portrait bottom navigation, landscape navigation rail, non-overlapping split-pane frames, and narrow-tablet sheet fallback behavior for chats, settings, agent, and wallet views.
- The Web PWA wrapper is represented by `src/platform/web-pwa-wrapper.mjs`. It defines the browser runtime and static asset boundary, web app manifest metadata, service worker cache and update strategy, offline shell validation, installability checks, and progressive fallbacks for TDLib, Teleton Agent IPC, notifications, background sync, and secure storage.
- Agent mode defaults to `off`; cloud and hybrid modes require explicit activation.
- Agent settings UI shells use shared view state for mode options, model provider preferences, LLM provider configuration, privacy impact prompts, approval preferences, and autonomous action limits. Cloud and hybrid activation stays pending until the user confirms the privacy impact summary.
- LLM provider credentials use secure references such as `env:NAME`, `keychain:name`, `keystore:name`, or `secret:name`. Local providers cannot persist shared credentials, while cloud and custom HTTPS endpoint providers require explicit cloud processing opt-in before use.
- Automatic token refresh is represented by `src/foundation/token-refresh.mjs`. The shared contract inventories Telegram, agent provider, settings sync, and TON credential references, schedules refresh before expiry, retries transient network failures with bounded backoff, and moves revoked or invalid tokens into explicit reauthentication states without serializing plaintext credentials.
- Proxy secrets are represented as secure references such as `env:NAME`, `keychain:name`, or `keystore:name`.
- Proxy settings UI shells use shared view state for list items, edit forms, test status, auto-switch preferences, and active route metadata. Display snapshots expose only configured flags for secrets, while settings persistence keeps secure references for platform storage resolution.
- Proxy usage statistics are local diagnostics records keyed by proxy id. They track attempts, successes, failures, latency samples, and last-used time separately from proxy configuration and never include proxy secrets or message contents.
- Public MTProto proxy catalog use is opt-in and disabled by default. Catalog entries must include source URL/name, source verification notes, freshness timestamps, and per-entry human review metadata before they can be shipped.
- Settings synchronization is disabled by default and represented by `src/foundation/settings-sync.mjs`. The sync boundary only serializes safe appearance, notification, and non-activating agent preference fields plus pseudonymous conflict metadata. Sync transport configuration, encryption key references, proxy configuration, cloud-capable agent activation, provider credentials, secure references, local security controls, and agent memory remain device-local.
- Offline synchronization is represented by `src/foundation/offline-sync.mjs`. It distinguishes live state from cached-offline resources, records unsupported live-only actions, queues allowed writes with redacted visible previews, and persists queued action payloads only inside AES-256-GCM encrypted envelopes keyed by platform secure storage.
- Cross-platform push notifications are represented by `src/foundation/push-notifications.mjs`. The shared model covers messages, Teleton Agent approvals, and TON wallet events with category preferences, default-redacted payloads, and explicit permission failure plans for Android, iOS, desktop, and web wrappers.
- The shared input action map is represented by `src/platform/action-map.mjs`. It assigns stable action ids to high-frequency messaging, Teleton Agent, and TON wallet workflows, adapts them to desktop shortcuts and mobile gestures, reports shortcut or gesture collisions per platform, and exposes `input.riskyActionBindings.enabled` plus per-action disablement so users can turn off risky agent or wallet bindings without removing visible controls.
- Local Teleton Agent startup is represented by the `src/foundation/agent-runtime-supervisor.mjs` lifecycle boundary. Platform wrappers supply start, stop, health, resource, and log hooks; the shared supervisor keeps the default runtime local and never requires cloud credentials for startup.
- Teleton Agent UI communication is represented by the `src/foundation/agent-ipc-bridge.mjs` contract. It uses versioned IPC envelopes for request, event, response, error, and cancellation flows; UI layers receive incoming message hooks and can distinguish informational events from confirmation-required action proposals.
- Teleton Agent action notifications are represented by the `src/foundation/agent-action-notifications.mjs` contract. It converts action lifecycle IPC events into UI and platform notification payloads, always surfaces approval-required actions, filters informational updates through notification settings, and uses redacted lock-screen copy that does not include private message content.
- Teleton Agent action history is represented by the `src/foundation/agent-action-history.mjs` contract. It stores redacted action records with status, actor, and timestamp fields, filters records by a local retention window, exposes rollback requests only while rollback metadata remains eligible, and marks irreversible proposals before execution.
- Teleton Agent plugins are represented by the `src/foundation/agent-plugin-registry.mjs` contract. Plugins declare permissions, lifecycle defaults, and IPC compatibility before they can be enabled. Disabled plugins cannot receive events or perform actions, and enable, disable, list, and health-check flows are routed through the agent bridge.
- Local Teleton Agent memory is represented by the `src/foundation/agent-memory-store.mjs` contract. It encrypts memory snapshots, vector index payloads, and local credential references with AES-256-GCM while platform wrappers keep the raw data key in OS secure storage providers such as Keychain or Keystore.
- TON wallet operations are represented by the `src/ton/wallet-adapter.mjs` contract. Shared callers can retrieve balance, display a receive address, prepare unsigned transfer drafts, and query transfer status while platform wrappers keep private keys behind wallet providers or secure storage references.
- TON signing requires user confirmation and platform secure storage or wallet-provider approval. Transfer preparation validates explicit confirmation before provider calls and still returns an unsigned draft for a later signing flow.
- TON swap operations are represented by the `src/ton/swap-adapter.mjs` contract. Shared callers can request STON.fi or DeDust quotes without signing, while swap transaction draft preparation requires explicit confirmation and provider errors are sanitized before they cross the shared boundary.
- TON NFT gallery operations are represented by the `src/ton/nft-gallery.mjs` contract. Shared callers can request owned NFT items, collection metadata, and item metadata through a cacheable adapter boundary; metadata text, attributes, and media URLs are sanitized before reaching gallery UI state, and shells can render loading, empty, failed, ready, verified, unverified, and malformed metadata states without accessing wallet secrets.
- TON staking operations are represented by the `src/ton/staking-adapter.mjs` contract. Shared callers can preview Tonstakers and Whales stake, unstake, and rewards states without signing; every preview carries provider risk and fee disclosure that must be visible before approval, and stake/unstake transaction drafts require explicit confirmation before provider calls. The adapter marks staking with a high-severity human review risk so release enablement requires financial and provider assumption review.
- TON DNS operations are represented by the `src/ton/dns-adapter.mjs` contract. Shared callers can resolve normalized `.ton` names to wallet or supported resource records, cache successful resolutions with expiration, and receive explicit unverified fallback state when names are missing, invalid, spoof-like, or provider resolution fails.
- TON transaction confirmation is represented by the `src/ton/transaction-confirmation.mjs` workflow. It builds review state with amount, recipient, network fee, provider, limit state, and risk indicators, then requires a platform biometric or password approval bridge before callers may continue to signing. The workflow records pending, approved, rejected, and failed history states for audit views.
- TON transaction history is represented by the `src/ton/transaction-history.mjs` contract. It normalizes TON and Jetton activity into immutable history records, distinguishes confirmed, pending, failed, and cancelled states for UI rendering, filters by type, token, status, date range, and counterparty, and exposes deterministic cursor pagination with empty-state metadata while skipping malformed provider records with diagnostics.
- TON testnet coverage is represented by the `src/ton/testnet-coverage.mjs` harness. It exercises balance, receive-address, unsigned transfer draft, transfer status, and confirmation paths in mock mode by default, and switches to live testnet mode only when protected CI supplies the explicit testnet environment contract.

## TDLib Two-Factor Authentication

The shared two-factor authentication controller turns TDLib password-required authorization states into UI-ready prompt state. It carries safe prompt metadata, optional password hints, recovery email patterns, recovery guidance, failure messages, and action ids for submit, recovery, cancellation, and restart flows.

Two-factor drafts are runtime-only values. Password and recovery-code input is cleared after submission or cancellation, and log events record only outcomes, attempt counts, and field lengths. The shared security settings expose `security.twoFactor.passwordHintsEnabled`, `security.twoFactor.recoveryGuidanceEnabled`, and `security.twoFactor.failureFeedbackEnabled` so platform settings screens can control prompt copy without storing credentials.

## Message Database Encryption

The shared message database storage contract protects the local TDLib cache boundary before native database adapters exist. `src/tdlib/message-database-storage.mjs` encrypts messages, indexes, and attachments metadata as a single `teleton.messageDatabase.encrypted` snapshot using AES-256-GCM. The encrypted envelope records only algorithm metadata, device-local key reference scope, encryption boundaries, nonce, authentication tag, and ciphertext; message bodies, chat ids, search terms, filenames, cache references, and attachment metadata stay inside ciphertext.

Platform wrappers supply secure storage with `get` and `set` hooks. The shared contract creates or reads a 32-byte database data key from Keychain, Keystore, desktop credential vaults, or reviewed browser secure storage fallbacks, using default key references such as `keychain:teleton.messageDatabase.desktop.v1` or `keystore:teleton.messageDatabase.android.v1`. Shared settings keep `security.encryptMessageDatabase` enabled by default and reject settings that disable it, while `security.messageDatabaseKeyRef` accepts only secure references.

Legacy plaintext snapshots can be migrated in place by decrypting nothing, validating the plaintext shape, encrypting it, and writing the encrypted snapshot back through the persistence hook. Restore failure states are explicit and non-destructive: locked secure storage returns `locked`, missing keys return `missing-key`, authentication or parse failures return `failed-decryption`, and plaintext snapshots return `migration-required` unless migration is requested. These states preserve the original snapshot and require explicit user consent before any reset or deletion path can clear it.

## Hardware Security Keys

The shared hardware security key contract models FIDO2/WebAuthn, CTAP2, and legacy U2F/CTAP1-compatible authenticators without bundling native platform code. It treats registration and assertion ceremonies as three explicit boundaries: a server challenge boundary, a platform authenticator boundary, and a server verification boundary. Shared state stores only safe ceremony summaries such as challenge ids, credential ids, transports, status, and timestamps; attestation objects, client data JSON, authenticator data, and signatures stay inside the platform or verification bridge and are not serialized into logs.

Platform support is always gated by capability checks before registration or high-risk approval prompts are shown:

| Platform | Platform API boundary | Required shared capability flags |
| --- | --- | --- |
| Web | WebAuthn PublicKeyCredential through `navigator.credentials.create()` and `navigator.credentials.get()` | `secureContext`, `publicKeyCredential` |
| iOS | AuthenticationServices `ASAuthorizationSecurityKeyPublicKeyCredentialProvider` and `ASAuthorizationPlatformPublicKeyCredentialProvider` | `authenticationServices`, `securityKeyCredentialProvider` |
| Android | Android Credential Manager public-key credential APIs for passkeys and hardware-backed FIDO authenticators | `credentialManager`, `publicKeyCredentials` |
| Desktop | Electron or Chromium WebAuthn PublicKeyCredential, or a reviewed native FIDO2 bridge | `secureContext` plus `publicKeyCredential`, or `nativeFido2Bridge` |

The default security settings keep hardware key flows disabled. Enabling them through `security.hardwareKeys.enabled`, `security.hardwareKeys.requireForHighRiskActions`, or `security.hardwareKeys.requireForAccountProtection` requires `security.hardwareKeys.releaseReviewed: true`, so release enablement is blocked until a human security review approves platform capability detection, origin and relying-party binding, diagnostics redaction, and fallback behavior.

Fallback is explicit when hardware keys are unavailable. `two_factor_or_password` keeps TDLib two-factor or password approval available, `device_lock_then_password` attempts device lock approval before password or two-factor authentication, and `block_high_risk_action` blocks protected high-risk actions until a supported hardware key path is available. Agent and TON flows marked `review-required` must still keep their normal review screens; the hardware key gate adds a stronger approval method and never bypasses visible confirmation.

## Local Agent Runtime

The local Teleton Agent lifecycle has four platform targets:

| Platform | Supported local runtime direction | Packaging gaps |
| --- | --- | --- |
| Android | App-private foreground service wrapping a bundled agent binary, with WorkManager jobs for sync work. | Kotlin/Jetpack Compose wrapper contract is defined; concrete Gradle sources, ABI-specific binary packaging, update policy, and sandbox-safe IPC still need native implementation. |
| iOS | SwiftUI app with BGTaskScheduler-managed in-app or extension-backed local agent work inside iOS background execution limits. | SwiftUI/Xcode wrapper contract is defined; concrete Xcode sources, signed framework packaging, entitlements, APNs setup, and App Store review still need native implementation. |
| Desktop | Child process supervised by the Electron desktop shell with local IPC. | Electron wrapper contract is defined; concrete main/preload/renderer sources, per-OS agent binaries, code signing or notarization, crash restart policy, log paths, and IPC endpoint reservation still need native implementation. |
| Web | Browser worker, WebAssembly runtime, or native-host bridge when available. | PWA wrapper contract is defined; concrete web UI assets, native-host installation, TDLib bridge deployment, notification push service, and browser storage hardening still need implementation. |

The shared supervisor exposes `start`, `stop`, `status`, `health`, `resources`, and `logs` operations. It accepts a platform adapter so each wrapper can own process management while foundation tests verify idempotent lifecycle behavior and failure state handling.

Resource monitoring samples process id, uptime, CPU usage percent, and resident memory bytes when a platform adapter can provide them. The shared thresholds produce `healthy`, `degraded`, or `unavailable` states so UI shells can display agent resource status and diagnostics logs can record high CPU, high memory, or missing metric conditions. Runtime health and resource diagnostics are sanitized before they are stored or emitted, and resource monitoring never includes message content.

## Agent IPC Bridge

The shared agent IPC bridge is transport-agnostic so desktop pipes, mobile service bindings, browser workers, HTTP, or WebSocket adapters can reuse the same contract. Version 1 envelopes include an id, kind, source, target, timestamp, and object payload. Request envelopes carry an action, event envelopes carry a typed event name, responses and errors reference `replyTo`, and cancellation envelopes reference `cancelId`.

UI-facing agent events are classified by confirmation behavior. Informational updates such as `agent.info`, incoming message hooks such as `agent.message.received`, and task progress events are delivered without confirmation. Action proposals such as `agent.action.proposed` are marked `requiresConfirmation: true` before dispatch so UI shells can route them to consent flows.

## Cross-Platform Push Notifications

The shared push notification model normalizes three user-visible categories: `messages`, `agentApprovals`, and `wallet`. Message notifications use generic display copy by default; agent approvals use critical priority and can bypass the global mute switch unless the user disables the agent approval category; wallet notifications use generic wallet status copy. Serialized payloads are redacted recursively, removing message bodies, chat titles, sender names, prompts, wallet addresses, amounts, mnemonics, private keys, tokens, and other sensitive fields before a platform adapter receives them.

Notification settings now include per-category preferences so users can disable message, agent approval, or wallet notifications independently. Delivery planning returns explicit disabled reasons such as `category-disabled`, `notifications-disabled`, and `mention-filtered`, allowing UI shells to explain why a push did not leave the shared boundary.

Platform wrappers consume the same delivery plan. Android maps categories to private notification channels and reports `android.permission.POST_NOTIFICATIONS` denial with an open-settings recovery action. iOS maps categories to `UNNotificationCategory` identifiers and reports `UNUserNotificationCenter` prompt or denial states. Desktop maps to Electron system notifications and operating system notification-center failures. Web maps to service worker notification requests and falls back to in-app badges and foreground polling when Notifications API or Push API permission is unavailable.

## Agent Action Notifications

The shared agent action notification boundary maps `agent.action.proposed`, `agent.action.started`, `agent.action.completed`, and task update events into normalized notification payloads for UI surfaces and platform notification adapters. Approval-required actions use critical priority and remain visible even when informational notifications are disabled, because they block agent progress until the user responds.

Informational start, completion, and failure notifications respect the shared notification settings, including disabled notifications and mentions-only filtering. Notification bodies use action labels only, while lock-screen text and serialized payloads remove private message text, chat names, sender names, prompts, and context fields before dispatch.

## Shortcut and Gesture Actions

The shared input action map keeps shortcuts and gestures tied to the same workflow ids across platform wrappers. Desktop consumes the map as focused-window and opt-in global Electron shortcuts, while iOS and Android consume it as SwiftUI or Jetpack Compose gesture metadata. Messaging actions cover search, compose, and chat navigation. Agent quick actions and TON transfer review actions are marked `review-required`, require explicit confirmation, and can be removed from shortcut or gesture plans through the shared risky-action setting or per-action disabled ids.

Each generated platform plan includes a collision report. Duplicate accelerators in the same desktop scope or duplicate gestures in the same mobile context are blocking conflicts for native wrappers to fix before registration. Mobile plans also document reserved system gestures, such as Android system back edge swipes and iOS edge or Home indicator gestures, so native shells can avoid overriding platform accessibility and navigation behavior.

Gestures and shortcuts are convenience bindings only. The same actions must remain reachable through visible controls, menus, keyboard focus where available, or screen-reader actions, and transaction or agent flows must still pass through their review screens before execution.

## Agent Action History

The shared action history boundary records proposed, started, completed, failed, cancelled, and rolled-back agent actions with normalized status, actor, timestamp, action label, and redacted payload metadata. The default retention window is 30 days, and platform storage adapters can prune older records before presenting history views.

Rollback metadata is explicit. Reversible actions declare a direct or compensating rollback action, sanitized rollback payload, and optional expiry timestamp. Rollback requests are exposed only while that metadata remains eligible. Irreversible proposals carry an ineligible rollback marker, a human-readable reason, and a confirmation warning before execution so UI shells can distinguish actions that cannot be compensated later.

## Agent Plugin System

The shared plugin registry normalizes plugin manifests with an id, name, version, declared permissions, lifecycle metadata, and IPC compatibility. Permission scopes are explicit and reviewable, including message read/write access, agent event delivery, agent action execution, storage access, and network access.

Plugins start disabled after registration. Enabling a plugin sends an `agent.plugin.enable` request through the bridge with the normalized manifest, disabling sends `agent.plugin.disable`, list uses `agent.plugin.list`, and health checks use `agent.plugin.health`. The registry checks both lifecycle state and declared permissions before a plugin can receive agent events or perform actions, so disabled plugins cannot receive events or perform actions even if their manifest declares the relevant scope.

## Agent Memory Encryption

Agent memory encryption is enabled by default in the shared settings model through `security.encryptAgentMemory`. The foundation layer refuses settings that disable it and accepts only secure references for custom `security.agentMemoryKeyRef` values.

Platform wrappers supply a secure storage provider with `get` and `set` hooks. The shared memory store creates or reads the platform data key, encrypts JSON-serializable memory payloads with AES-256-GCM, stores only ciphertext plus nonce/authentication metadata in local files, and resolves the key only during unlock, migration, or rotation flows. Missing keys and locked secure storage states fail closed so plaintext memory is not returned.

## Agent Settings UI

The shared agent settings view state is implemented in `src/foundation/agent-settings-view.mjs`. It exposes the canonical `off`, `local`, `cloud`, and `hybrid` mode controls from the settings model, keeps the default mode off, and blocks cloud-capable mode changes behind an explicit privacy impact confirmation step before enabling cloud processing consent.

The view also carries model provider/model id preferences, provider configuration types, confirmation requirements, and the per-hour autonomous action limit. Provider configuration supports local endpoints, approved cloud providers, and approved custom HTTPS endpoints. Shared validation rejects raw API keys or tokens, requires secure credential references for cloud providers, and blocks cloud-capable providers until the user has opted in to cloud processing. Platform UI shells can render this state directly while persisting only the validated shared agent settings payload.

## Automatic Token Refresh

The token refresh foundation contract keeps credential lifecycle handling separate from platform secure storage. Token records carry stable ids, an integration type, a credential reference field, an optional refresh credential reference, expiry metadata, and safe failure metadata. Supported integrations are `telegram`, `agent-provider`, `settings-sync`, and `ton`; their catalog maps the credential fields used by TDLib authentication, cloud or custom agent providers, settings sync encryption or transport access, and TON wallet provider boundaries.

Refresh planning is deterministic. `createTokenRefreshPlan()` marks refreshable expired or soon-expiring credentials as `refresh_due`, leaves non-expired credentials `valid` with a `nextRefreshAt` timestamp, and reports revoked or non-refreshable expired credentials as `reauthentication_required`. Platform wrappers own the actual provider call through `createTokenRefreshController({ refreshToken })`, which receives only secure references and returns updated secure references plus a new expiry. Raw access tokens, refresh tokens, API keys, bot tokens, private keys, mnemonics, and secrets are rejected before bridge calls.

Refresh failures are explicit UI states. Revoked, unauthorized, or invalid-token responses become `reauthentication_required` with an integration-specific action such as `telegram.reauthenticate`, `agent.provider.reauthenticate`, `settings.sync.reauthenticate`, or `ton.wallet.reauthenticate`. Transient network failures become `refresh_failed` with bounded exponential backoff and a `nextAttemptAt` timestamp so wrappers can retry without prompting for credentials prematurely. Failure messages are sanitized before they can reach diagnostics, tests, or UI state.

## Tablet Layout

The shared responsive tablet layout contract keeps core Teleton workflows reachable without desktop-only controls. Portrait tablets reserve a bottom navigation bar for chats, agent, wallet, and settings routes, while landscape tablets reserve a navigation rail with the same route set.

Tablet viewports are classified by a 600 px minimum short edge and a 1366 px maximum long edge. Regular tablets show readable two-pane layouts when width is at least 744 px. Expanded tablets at 1024 px and wider may show a third supporting pane only when the active detail pane can keep its minimum width. Narrow tablets keep the detail pane visible and move primary or supporting panes into sheets, preventing horizontal overflow and overlapping content.

The layout state returns measured content bounds, pane frames, presentation modes, route targets, minimum widths, and `horizontalOverflow: false` for chats, settings, agent, and wallet views. Android, iOS, desktop, and future web shells can render these frames with native controls while keeping the shared navigation and pane behavior consistent.

## Web PWA Wrapper

The Web PWA wrapper contract keeps the browser shell installable where supported while treating native-only features as progressive capabilities. The manifest uses app id and start URL `/app/`, root scope `/`, standalone display mode, 192 x 192 and 512 x 512 PNG icon metadata, and app shortcuts for chats, agent controls, and wallet workflows.

The service worker reserves `web/service-worker.js`, precaches the shell assets needed for offline launch, and uses `/offline.html` as the navigation fallback. Runtime API responses and private media stay `network-only` so message content, prompts, proxy diagnostics, wallet data, and agent payloads are not persisted in shell caches. Update checks run on launch and visibility restoration; activation uses a prompt-before-reload policy so active chats, agent approvals, and wallet reviews are not interrupted.

Browser support is documented as a progressive matrix. TDLib must run through a trusted backend, native host, or platform bridge that keeps Telegram credentials and native session caches out of browser JavaScript. Agent IPC can use service worker messaging, `BroadcastChannel`, or a user-installed native host, but browser-only code must not auto-start a local agent. Notifications use service worker push and the Notifications API after a user prompt, with in-app badges and foreground polling as fallback. Durable browser storage uses IndexedDB plus WebCrypto non-extractable keys where available, and falls back to session-only state plus reauthentication when secure storage is unavailable.

## Settings Synchronization

The shared settings synchronization implementation is intentionally a foundation contract, not a bundled cloud service. `createSettingsSyncPlan()` defaults to `enabled: false` with the `disabled` transport, so users can keep sync disabled indefinitely. Enabling sync requires an explicit non-disabled transport, a stable device id, and an encryption key reference resolved through platform secure storage. `createSettingsSyncDeviceIdentity()` normalizes the stable device id, platform, display name, and enrollment timestamp without serializing credentials.

The sync payload is a canonical cleartext boundary that platform adapters encrypt before storage or transport. `publishSettingsSyncSnapshot()` creates an encrypted transport snapshot, and `pullSettingsSyncSnapshot()` decrypts the latest remote snapshot before applying deterministic field-level merge rules. The required envelope encryption is AES-256-GCM with a device-local key reference; the key reference itself is never serialized into the cross-device payload. Future transports can be manual export, platform-provider storage, or self-hosted storage without changing the shared field policy.

Syncable fields are deliberately narrow: `language`, `theme`, notification preferences including category preferences and quiet hours, `agent.model`, `agent.requireConfirmation`, and `agent.maxAutonomousActionsPerHour`. Device-local fields include `platform`, sync enablement, sync transport settings, sync encryption key references, `proxy.enabled`, `proxy.activeProxyId`, `proxy.entries[]`, `proxy.publicCatalog`, `agent.mode`, `agent.allowCloudProcessing`, `agent.providerConfig`, local security controls, `security.twoFactor`, `security.agentMemoryKeyRef`, `security.secretRefs`, and `agent.memory`.

Secret material is excluded from serialized sync payloads. The explicit secret boundary includes `sync.encryptionKeyRef`, `proxy.entries[].secretRef`, `proxy.entries[].usernameRef`, `proxy.entries[].passwordRef`, `agent.providerConfig.apiKeyRef`, `agent.providerConfig.tokenRef`, `security.agentMemoryKeyRef`, `security.secretRefs`, local agent memory, and runtime-only two-factor passwords or recovery codes. This prevents sync from copying credentials or enabling cloud-capable behavior on another device without local consent and local credential setup.

Conflict behavior is deterministic and documented as field-level last-writer-wins. Each syncable field carries `updatedAt`, `revision`, and `deviceId` metadata. The resolver chooses the newer `updatedAt`; if timestamps match, it chooses the higher revision; if revisions also match, it chooses the lexicographically larger device id. Identical metadata keeps the local value. Applying a pulled snapshot overlays only syncable fields on top of the local settings model, so local proxy credentials, provider credential references, sync key references, device security controls, and local-only agent memory remain local.

## Offline Mode

The shared offline mode contract is a queue and state boundary, not a promise that every protocol action can run offline. It marks chat lists, chat threads, message history, settings views, agent action history, and TON transaction history as readable from cache when a wrapper has a local snapshot. UI shells receive explicit `cached-offline` or `unavailable-offline` states so users can distinguish stale cached data from live state.

Queued actions are limited to operations that can safely reconcile later, such as message sends, message edits, and non-secret settings updates. Live-only operations such as message deletion, agent approval, and wallet signing return unsupported action metadata with reasons like `requires-live-state`, `requires-live-agent`, and `requires-live-signing`. Visible queue rows expose action type, target, status, retry metadata, conflict metadata, and redacted payload previews while omitting private message text, chat names, secure references, wallet values, and tokens.

Queued action persistence uses `teleton.offlineSync.queue.encrypted` envelopes with AES-256-GCM. Platform wrappers resolve the device-local key reference from Keychain, Keystore, or another secure storage provider before decrypting the queue; the key reference is not serialized into the queue envelope. Reconnect replay keeps cancelled actions out of the executor, retries transient failures with `nextAttemptAt`, marks server-side base revision mismatches as conflicts, and keeps conflicted actions cancellable until a user or wrapper resolves them.

## Foundation Status

This PR implements only the foundation layer, epic decomposition workflow, baseline TDLib adapter boundary, TDLib two-factor state controller, message database encryption contract, hardware security key contract, Android wrapper contract, iOS wrapper contract, desktop wrapper contract, shared input action map, responsive tablet layout contract, Web PWA wrapper contract, settings synchronization foundation contract, offline synchronization foundation contract, local agent runtime lifecycle contract, agent IPC bridge contract, local agent memory encryption contract, automatic token refresh contract, mock-backed TON wallet adapter boundary, and mock-backed TON swap adapter boundary. Native Gradle, Xcode, or Electron sources, concrete web UI assets, live TDLib integration, concrete agent process packaging, concrete IPC transports, concrete secure storage bindings, hardware authenticator bridges, production sync providers, and live TON operations remain tracked by the generated subtasks in `config/epic-subtasks.json`.
