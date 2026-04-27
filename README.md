# Teleton Client

Teleton Client is a planned cross-platform Telegram-compatible messenger foundation that combines TDLib, a user-controlled Teleton AI agent, proxy-aware connectivity, and TON blockchain support.

This repository is in the foundation phase. The current implementation establishes the project structure, CI checks, privacy/build documentation, issue templates, and a machine-readable epic decomposition that can be converted into GitHub subissues.

## Current Capabilities

- Dependency-free Node.js validation and test suite.
- Machine-readable backlog for the Teleton Client foundation epic.
- Published GitHub subissues for the issue `#1` decomposition, tracked in the manifest.
- GitHub issue and pull request templates for reproducible, secret-free contributions.
- Dry-run and idempotent GitHub issue creation script for decomposing issue `#1`.
- Shared cross-platform settings model for language, theme, notifications, agent mode, proxy, and secure references.
- Shared push notification model for messages, Teleton Agent approvals, and TON wallet events with redacted payloads, category preferences, and platform permission failure plans.
- Shared input action map for desktop shortcuts and mobile gestures, including conflict reports, accessibility alternatives, and user disablement for risky agent or wallet actions.
- Shared agent settings view state for off, local, cloud, and hybrid modes, model preferences, privacy prompts, approval preferences, and autonomous action limits.
- ProxyManager route selection for direct, MTProto, and SOCKS5 connectivity using saved preferences, health inputs, latency ranking, and failure cooldowns.
- Shared proxy settings view state for add, test, enable, disable, edit, remove, reset statistics, and export diagnostics workflows without exposing secure references.
- Local proxy usage statistics for attempts, successes, failures, latency, and last-used time, stored separately from proxy secrets.
- Optional public MTProto proxy catalog metadata model that stays disabled by default and requires source freshness plus human review metadata before release.
- Optional settings synchronization foundation that stays disabled by default, encrypts opt-in transport snapshots, serializes only safe appearance, notification, and non-activating agent preferences, excludes secret material, and defines deterministic field-level conflict resolution.
- Shared offline synchronization contract that marks cached offline state, lists unsupported live-only actions, stores queued writes encrypted at rest, and supports retry, conflict, and cancellation states before replay.
- Baseline TDLib client adapter contract with mock-backed tests.
- TDLib two-factor authentication state controller for password-required, recovery-required, failed, cancelled, and completed flows without storing passwords or recovery codes in shared state.
- Local message database encryption contract for cached messages, search indexes, and attachments metadata using platform secure storage keys, AES-256-GCM payloads, legacy plaintext migration, locked-store handling, and non-destructive failed-decryption recovery states.
- Secure data deletion foundation for local account data, cached media, agent memory, and wallet local state, with irreversible confirmation copy, cache recovery-window planning, platform storage locations, and human security review gates for filesystem limitations.
- Hardware security key foundation contract for WebAuthn/FIDO registration and assertion flows, platform capability checks, explicit fallback authentication, and release review gates.
- TON wallet adapter contract for balance lookup, receive address display, transfer draft preparation, and status checks without plaintext private keys.
- TON swap adapter contract for STON.fi and DeDust quote lookup plus confirmation-gated swap transaction draft preparation.
- TON NFT gallery adapter contract for owned item lookup, collection/item metadata loading, sanitized media metadata, and loading/empty/failed/ready gallery states.
- TON staking adapter contract for Tonstakers and Whales previews, explicit risk/fee disclosure, rewards previews, and confirmation-gated unsigned stake/unstake drafts.
- TON transaction confirmation workflow for review details, biometric or password approval hooks, limit/risk indicators, and status history.
- TON testnet coverage harness that runs wallet flow checks in mock mode locally and requires explicit protected environment variables before live testnet execution.
- End-to-end workflow harness that covers TDLib auth, messaging, agent reply proposal/confirmation, and TON transaction draft/confirmation in mock mode, with live checks gated by protected environment variables and redacted failure artifacts.
- Android wrapper contract for the Kotlin/Jetpack Compose stack, runnable debug APK artifact metadata, notification channels, WorkManager and foreground service boundaries, and Telegram/TON deep-link routing.
- iOS wrapper contract for the SwiftUI/Xcode stack, runnable debug simulator app artifact metadata, Keychain-backed secret references, APNs push notifications, BGTaskScheduler boundaries, Telegram/TON deep-link routing, and App Store compliance notes.
- Desktop wrapper contract for the Electron stack, runnable debug artifact metadata for Linux, macOS, and Windows, tray menu behavior, system notifications, shortcuts, autostart, protocol routing, and DMG/EXE/AppImage packaging targets.
- Responsive tablet layout contract for chats, settings, agent, and wallet views, including shared breakpoints, portrait and landscape navigation modes, split-pane frames, and narrow-tablet sheet fallback behavior.
- PWA wrapper contract for the web app manifest, service worker strategy, offline shell validation, update behavior, installability metadata, and browser fallbacks for unsupported native capabilities.
- Local Teleton Agent runtime supervisor contract with mock lifecycle tests for start, stop, health, resource monitoring, and logs.
- Teleton Agent action notification contract for proposals, starts, completions, approval-required states, and failures with settings-aware delivery and redacted lock-screen text.
- Teleton Agent action history contract for redacted action records, retention filtering, rollback eligibility, and irreversible action markers.
- Teleton Agent plugin registry contract with manifest permissions, enable/disable/list/health bridge flows, and lifecycle permission gates.
- Local Teleton Agent memory encryption contract using platform secure storage key providers, AES-256-GCM payloads, migration, missing-key, locked-store, and key-rotation tests.
- CI workflow for foundation checks.
- Automated committed-secret scanning with documented credential rotation and secure storage review requirements.
- Attachable security audit report for release review evidence across secrets, dependency risk, permission boundaries, and release readiness.
- Published security policy for supported versions, private vulnerability reporting, coordinated disclosure, and human maintainer review before release.
- Upstream license matrix for TDLib, Telegram reference clients, Teleton Agent, and TON SDK release review.
- Documented semantic version source of truth and release metadata validation.
- Required project documents: `README.md`, `SECURITY.md`, `PRIVACY.md`, `LICENSE`, and `BUILD-GUIDE.md`.

## Quick Start

```sh
npm test
npm run validate:secrets
npm run audit:security
npm run validate:foundation
npm run validate:release
npm run decompose:dry-run
```

Enable local pre-commit checks with:

```sh
npm run prepare:hooks
```

## Architecture Direction

The project is intended to evolve through these layers:

1. Platform UI layers for Android, iOS, desktop, and web.
2. TDLib bindings for Telegram protocol, cache, and synchronization.
3. Teleton Agent orchestration through local IPC and optional cloud/hybrid modes.
4. TON blockchain integrations for wallet, transfers, swaps, NFTs, staking, and DNS.
5. Security and privacy controls for credentials, user consent, and auditability.

See `SECURITY.md`, `docs/architecture.md`, `docs/backlog.md`, `docs/tdlib-adapter.md`, `docs/android-wrapper.md`, `docs/ios-wrapper.md`, `docs/desktop-wrapper.md`, `docs/tablet-layout.md`, `docs/web-pwa-wrapper.md`, `docs/security-audit.md`, `docs/license-matrix.md`, and `docs/release-strategy.md` for the current foundation plan. The agent settings, local runtime, input action map, Android wrapper, iOS wrapper, desktop wrapper, tablet layout, PWA, message database encryption, secure data deletion, security policy, security audit, and license matrix sections record the shared settings UI contract, supported runtime directions, platform execution boundaries, shortcut and gesture behavior, hardware security key capability checks, responsive tablet behavior, web installability behavior, vulnerability reporting expectations, credential rotation expectations, secure storage review requirements, upstream license obligations, and remaining packaging gaps for Android, iOS, desktop, and web wrappers.

## Contribution Templates

Use the GitHub issue templates for feature tasks, bug reports, and generated implementation subtasks. Pull requests should use the repository template to link issues, list tests, call out risks, and include screenshots for UI changes. See `docs/contributing-templates.md` for template expectations.

## Issue Decomposition

Preview the subissues generated from the epic:

```sh
npm run decompose:dry-run
```

Create the subissues after review:

```sh
node scripts/decompose-epic.mjs --create --repo xlabtg/Teleton-Client
```

The script skips duplicate issue titles and creates missing labels before opening issues. Creation requires write access to the target repository.

The initial decomposition has been published as issues `#5` through `#29`; each manifest entry records its `issueNumber` and `issueUrl`.

## License

The repository is licensed under MIT. Future TDLib, Telegram client, Teleton Agent, and TON integrations must preserve their upstream license obligations. See `docs/license-matrix.md` for the current upstream review matrix, copyleft boundaries, source publication notes, and human legal review gates.
