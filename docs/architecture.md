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
- Agent settings UI shells use shared view state for mode options, model provider preferences, LLM provider configuration, privacy impact prompts, approval preferences, and autonomous action limits. Cloud and hybrid activation stays pending until the user confirms the privacy impact summary.
- LLM provider credentials use secure references such as `env:NAME`, `keychain:name`, `keystore:name`, or `secret:name`. Local providers cannot persist shared credentials, while cloud and custom HTTPS endpoint providers require explicit cloud processing opt-in before use.
- Proxy secrets are represented as secure references such as `env:NAME`, `keychain:name`, or `keystore:name`.
- Proxy settings UI shells use shared view state for list items, edit forms, test status, auto-switch preferences, and active route metadata. Display snapshots expose only configured flags for secrets, while settings persistence keeps secure references for platform storage resolution.
- Proxy usage statistics are local diagnostics records keyed by proxy id. They track attempts, successes, failures, latency samples, and last-used time separately from proxy configuration and never include proxy secrets or message contents.
- Public MTProto proxy catalog use is opt-in and disabled by default. Catalog entries must include source URL/name, source verification notes, freshness timestamps, and per-entry human review metadata before they can be shipped.
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
- TON transaction confirmation is represented by the `src/ton/transaction-confirmation.mjs` workflow. It builds review state with amount, recipient, network fee, provider, limit state, and risk indicators, then requires a platform biometric or password approval bridge before callers may continue to signing. The workflow records pending, approved, rejected, and failed history states for audit views.
- TON testnet coverage is represented by the `src/ton/testnet-coverage.mjs` harness. It exercises balance, receive-address, unsigned transfer draft, transfer status, and confirmation paths in mock mode by default, and switches to live testnet mode only when protected CI supplies the explicit testnet environment contract.

## Local Agent Runtime

The local Teleton Agent lifecycle has four platform targets:

| Platform | Supported local runtime direction | Packaging gaps |
| --- | --- | --- |
| Android | Foreground service or bound service wrapping a bundled agent binary. | Service strategy, ABI-specific binary packaging, update policy, and sandbox-safe IPC still need platform implementation. |
| iOS | App extension or in-app process within iOS background execution limits. | App Store background constraints, signed framework packaging, entitlements, and suspension fallback behavior still need review. |
| Desktop | Child process supervised by the desktop shell with local IPC. | Per-OS binaries, code signing or notarization, crash restart policy, log paths, and IPC endpoint reservation still need implementation. |
| Web | Browser worker, WebAssembly runtime, or native-host bridge when available. | Browser support matrix, native-host installation permissions, and fallback behavior for unsupported browsers still need implementation. |

The shared supervisor exposes `start`, `stop`, `status`, `health`, `resources`, and `logs` operations. It accepts a platform adapter so each wrapper can own process management while foundation tests verify idempotent lifecycle behavior and failure state handling.

Resource monitoring samples process id, uptime, CPU usage percent, and resident memory bytes when a platform adapter can provide them. The shared thresholds produce `healthy`, `degraded`, or `unavailable` states so UI shells can display agent resource status and diagnostics logs can record high CPU, high memory, or missing metric conditions. Runtime health and resource diagnostics are sanitized before they are stored or emitted, and resource monitoring never includes message content.

## Agent IPC Bridge

The shared agent IPC bridge is transport-agnostic so desktop pipes, mobile service bindings, browser workers, HTTP, or WebSocket adapters can reuse the same contract. Version 1 envelopes include an id, kind, source, target, timestamp, and object payload. Request envelopes carry an action, event envelopes carry a typed event name, responses and errors reference `replyTo`, and cancellation envelopes reference `cancelId`.

UI-facing agent events are classified by confirmation behavior. Informational updates such as `agent.info`, incoming message hooks such as `agent.message.received`, and task progress events are delivered without confirmation. Action proposals such as `agent.action.proposed` are marked `requiresConfirmation: true` before dispatch so UI shells can route them to consent flows.

## Agent Action Notifications

The shared agent action notification boundary maps `agent.action.proposed`, `agent.action.started`, `agent.action.completed`, and task update events into normalized notification payloads for UI surfaces and platform notification adapters. Approval-required actions use critical priority and remain visible even when informational notifications are disabled, because they block agent progress until the user responds.

Informational start, completion, and failure notifications respect the shared notification settings, including disabled notifications and mentions-only filtering. Notification bodies use action labels only, while lock-screen text and serialized payloads remove private message text, chat names, sender names, prompts, and context fields before dispatch.

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

## Foundation Status

This PR implements only the foundation layer, epic decomposition workflow, baseline TDLib adapter boundary, local agent runtime lifecycle contract, agent IPC bridge contract, local agent memory encryption contract, mock-backed TON wallet adapter boundary, and mock-backed TON swap adapter boundary. Platform UI shells, live TDLib integration, concrete agent process packaging, concrete IPC transports, concrete secure storage bindings, and live TON operations remain tracked by the generated subtasks in `config/epic-subtasks.json`.
