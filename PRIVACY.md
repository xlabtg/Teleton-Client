# Privacy Policy Draft

Teleton Client is designed around explicit user control for Telegram-compatible messaging, Teleton Agent automation, proxy connectivity, and TON blockchain operations.

## Current Repository State

This repository currently contains foundation automation, configuration models, documentation, and tests. It does not yet ship a production client, collect telemetry, connect to Telegram, run an AI agent, or submit TON transactions.

## Data Handling Principles

- Chat data must remain local unless the user explicitly enables cloud or hybrid agent mode.
- AI models must not be trained on private chat content by default.
- Autonomous agent actions must require clear user consent and configurable limits.
- Proxy credentials and MTProto secrets must be represented by secure references, not hardcoded values.
- TON private keys and wallet credentials must use platform secure storage or user-approved wallet providers.

## Planned Data Flows

Telegram traffic will be handled through TDLib and optional user-configured proxies. Agent traffic will use a local IPC bridge by default, with cloud processing available only through an explicit setting. TON operations will use TON SDK or wallet-provider integrations and require confirmation for transactions.

## User Controls

The planned agent modes are `off`, `local`, `cloud`, and `hybrid`. The default is `off`. Users must be able to switch modes, set action limits, review sensitive actions, and disable automation without losing access to standard messaging features.

## Security Reporting

Please report vulnerabilities through GitHub private security advisories rather than public issues.
