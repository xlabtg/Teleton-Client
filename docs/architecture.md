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
- Proxy settings UI shells use shared view state for list items, edit forms, test status, auto-switch preferences, and active route metadata. Display snapshots expose only configured flags for secrets, while settings persistence keeps secure references for platform storage resolution.
- Proxy usage statistics are local diagnostics records keyed by proxy id. They track attempts, successes, failures, latency samples, and last-used time separately from proxy configuration and never include proxy secrets or message contents.
- Public MTProto proxy catalog use is opt-in and disabled by default. Catalog entries must include source URL/name, source verification notes, freshness timestamps, and per-entry human review metadata before they can be shipped.
- Local Teleton Agent startup is represented by the `src/foundation/agent-runtime-supervisor.mjs` lifecycle boundary. Platform wrappers supply start, stop, health, and log hooks; the shared supervisor keeps the default runtime local and never requires cloud credentials for startup.
- TON signing requires user confirmation and platform secure storage or wallet-provider approval.

## Local Agent Runtime

The local Teleton Agent lifecycle has four platform targets:

| Platform | Supported local runtime direction | Packaging gaps |
| --- | --- | --- |
| Android | Foreground service or bound service wrapping a bundled agent binary. | Service strategy, ABI-specific binary packaging, update policy, and sandbox-safe IPC still need platform implementation. |
| iOS | App extension or in-app process within iOS background execution limits. | App Store background constraints, signed framework packaging, entitlements, and suspension fallback behavior still need review. |
| Desktop | Child process supervised by the desktop shell with local IPC. | Per-OS binaries, code signing or notarization, crash restart policy, log paths, and IPC endpoint reservation still need implementation. |
| Web | Browser worker, WebAssembly runtime, or native-host bridge when available. | Browser support matrix, native-host installation permissions, and fallback behavior for unsupported browsers still need implementation. |

The shared supervisor exposes `start`, `stop`, `status`, `health`, and `logs` operations. It accepts a platform adapter so each wrapper can own process management while foundation tests verify idempotent lifecycle behavior and failure state handling.

## Foundation Status

This PR implements only the foundation layer, epic decomposition workflow, baseline TDLib adapter boundary, and local agent runtime lifecycle contract. Platform UI shells, live TDLib integration, concrete agent process packaging, and live TON operations remain tracked by the generated subtasks in `config/epic-subtasks.json`.
