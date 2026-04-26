# Privacy Policy

Teleton Client is designed around explicit user control for Telegram-compatible messaging, Teleton Agent automation, proxy connectivity, optional cloud processing, settings synchronization, and TON blockchain operations.

## Current Repository State

This repository currently contains foundation automation, configuration models, documentation, and tests. It does not yet ship a production client, collect telemetry, connect to Telegram, run an AI agent, synchronize settings, query TON services, or submit TON transactions.

## Data Handling Principles

- Private message content, prompts, agent memory, wallet data, and credentials stay local by default.
- Chat data must remain local unless the user explicitly enables settings synchronization or a cloud-capable agent mode that needs selected context.
- AI models must not be trained on private chat content by default.
- Autonomous agent actions must require clear user consent, configurable limits, reviewable history, and approval gates for sensitive actions.
- LLM provider credentials must be stored as secure references such as `env:NAME`, `keychain:name`, `keystore:name`, or `secret:name`; raw API keys and tokens must not be committed to settings, logs, issues, or pull requests.
- Telegram, proxy, sync, and TON credentials must be represented by secure references, not hardcoded values.
- Settings synchronization is opt-in and disabled by default. Sync payloads exclude secure references, proxy credentials, cloud provider credential references, local security controls, and private agent memory.
- TON private keys and wallet credentials must use platform secure storage or user-approved wallet providers.

## Data Flow Coverage

### Telegram Messaging

Current repository behavior: no code connects to Telegram, stores Telegram sessions, receives messages, or sends messages.

Planned behavior: Telegram traffic is handled through TDLib behind platform adapters. Telegram API credential references, session references, message caches, contact metadata, media metadata, and update streams stay inside the platform boundary or local app storage unless the user starts a flow that intentionally sends data through Telegram services. Two-factor passwords and recovery codes are runtime-only prompt values that shared state and logs must reduce to safe metadata such as field length, attempt count, recovery availability, and redacted recovery email pattern. Shared foundation code must not log message text, chat titles, phone numbers, Telegram credential values, two-factor prompt values, or session secrets.

### Proxy Connectivity

Current repository behavior: proxy settings models validate MTProto, SOCKS5, and HTTP CONNECT configuration shapes and reject raw proxy secrets. No live proxy connection is created by the repository foundation.

Planned behavior: user-configured proxy routes are optional. Platform bridges resolve `secretRef`, `usernameRef`, and `passwordRef` values through local secure storage before passing them to TDLib-native networking APIs. Shared settings snapshots, diagnostics, proxy tests, and network error logs may include proxy ids, protocol names, reachability status, and coarse latency data, but must not include proxy host credentials, MTProto secrets, usernames, passwords, or raw credential references when exporting diagnostics. The optional public proxy catalog remains disabled by default and requires source freshness plus human review metadata before release.

### Teleton Agent

Current repository behavior: the shared settings default the agent mode to `off`, expose local/cloud/hybrid mode choices, validate provider credential references, and model action approvals, notifications, memory, history, and IPC envelopes without starting a runtime.

Planned behavior: local mode keeps prompts, selected message context, model execution, action metadata, and private memory on the device or local companion bridge. Agent memory and action history must follow retention limits and avoid storing raw credentials or private keys. Users can set autonomous action limits, require approvals for sensitive tools, inspect action history, and disable automation without losing access to standard messaging features.

### Cloud Processing

Current repository behavior: cloud-capable modes cannot activate without explicit privacy impact confirmation in the shared settings view state.

Planned behavior: cloud and hybrid modes require explicit cloud processing opt-in before any selected prompt, message context, action metadata, provider telemetry, or tool result is sent to an approved cloud provider or custom HTTPS endpoint. Provider API keys and bearer tokens are represented only through secure references resolved by platform secure storage at runtime. Users can turn off cloud-capable modes, clear provider references, or replace provider references without exposing credential values through shared settings snapshots.

### Settings Synchronization

Current repository behavior: settings synchronization is modeled as disabled by default, accepts only safe shared fields, and excludes secure references plus private agent memory.

Planned behavior: cross-device settings synchronization can move appearance, notification, layout, proxy preference, and non-activating agent preference fields only after explicit user enablement. Platform adapters must encrypt sync envelopes before storage or transport, and each device must resolve its own local encryption key reference. Enabling sync on one device does not enable cloud-capable agent modes or copy sync credentials to another device.

### TON Blockchain

Current repository behavior: TON adapters prepare and validate mock wallet, transfer, swap, NFT, staking, DNS, confirmation, and testnet workflows without accepting plaintext private keys.

Planned behavior: TON operations use wallet-provider integrations, TON SDKs, or secure storage references for signing material. Balance lookup, receive address display, NFT metadata lookup, swap quotes, staking previews, DNS lookups, and transaction status checks may query TON providers or indexers with public wallet addresses and public transaction identifiers. Transfers, swaps, staking, and other wallet-changing operations must require confirmation before signing or broadcasting, and shared code must never log private keys, seed phrases, mnemonics, wallet provider credentials, or protected CI wallet material.

## User Controls

The planned agent modes are `off`, `local`, `cloud`, and `hybrid`. The default is `off`. Users must be able to switch modes, set action limits, review sensitive actions, and disable automation without losing access to standard messaging features.

Cloud-capable provider use requires explicit cloud processing opt-in before activation. Users can clear or replace provider references without exposing the underlying credential value through shared settings snapshots.

Users can leave cross-device settings synchronization disabled. Enabling sync on one device does not enable cloud-capable agent modes or copy sync credentials to another device; each device must opt in and provide local secure storage access independently.

TON transaction workflows must preserve a review screen, show the wallet action being prepared, and require explicit confirmation before signing or broadcasting.

## Policy Maintenance

Any pull request that adds, removes, or changes a Telegram, proxy, agent, cloud, settings synchronization, telemetry, diagnostic, storage, or TON data flow must update `PRIVACY.md` in the same pull request. The update must describe the default behavior, user opt-in or opt-out controls, credential handling, logging boundaries, and any external service that can receive user data.

Before release, reviewers must compare this policy against implemented behavior, platform documentation, settings defaults, secure storage boundaries, diagnostics, and tests. Privacy-sensitive changes require human maintainer review through CODEOWNERS before merge and before release readiness is claimed.

## Security Reporting

Please report vulnerabilities through GitHub private security advisories rather than public issues.
