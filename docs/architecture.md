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
- Agent mode defaults to `off`; cloud and hybrid modes require explicit activation.
- Proxy secrets are represented as secure references such as `env:NAME`, `keychain:name`, or `keystore:name`.
- Proxy settings UI shells use shared view state for list items, edit forms, test status, and active route metadata. Display snapshots expose only configured flags for secrets, while settings persistence keeps secure references for platform storage resolution.
- TON signing requires user confirmation and platform secure storage or wallet-provider approval.

## Foundation Status

This PR implements only the foundation layer, epic decomposition workflow, and baseline TDLib adapter boundary. Platform UI shells, live TDLib integration, live agent runtime, and live TON operations remain tracked by the generated subtasks in `config/epic-subtasks.json`.
