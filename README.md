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
- Baseline TDLib client adapter contract with mock-backed tests.
- CI workflow for foundation checks.
- Required project documents: `README.md`, `PRIVACY.md`, `LICENSE`, and `BUILD-GUIDE.md`.

## Quick Start

```sh
npm test
npm run validate:foundation
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

See `docs/architecture.md`, `docs/backlog.md`, and `docs/tdlib-adapter.md` for the current foundation plan.

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

The repository is licensed under MIT. Future TDLib, Telegram client, and TON integrations must preserve their upstream license obligations.
