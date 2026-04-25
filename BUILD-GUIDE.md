# Build Guide

Teleton Client is currently in the repository foundation phase. The present codebase provides the issue decomposition workflow, validation scripts, and small shared configuration models that future platform implementations will build on.

## Requirements

- Node.js 20 or newer.
- GitHub CLI (`gh`) for creating GitHub issues from the epic backlog.
- A GitHub account with write access to `xlabtg/Teleton-Client` when running issue creation.

## TDLib Build Targets

The current repository does not compile TDLib yet. The baseline adapter boundary in `src/tdlib/client-adapter.mjs` defines the platform-neutral contract that future native builds must implement for Android, iOS, desktop, and web-compatible callers.

Future TDLib build work should produce:

- Android native artifacts for supported NDK ABIs.
- iOS device and simulator artifacts packaged for the app wrapper.
- desktop artifacts for Linux, macOS, and Windows through a native module or helper process.
- a web-compatible bridge that calls a trusted local service or backend instead of shipping raw TDLib credentials into a browser runtime.

TDLib is distributed under the Boost Software License 1.0 (`BSL-1.0`). Future build scripts must preserve upstream license notices, record the TDLib source revision, and document local patches or packaging changes. See `docs/tdlib-adapter.md` for the adapter boundary and credential-handling rules.

## Local Checks

Run the same checks used by CI:

```sh
npm test
npm run validate:foundation
npm run decompose:dry-run
```

No dependency installation is required for the current foundation package because it uses only Node.js built-ins.

## Pre-commit Checks

Enable the repository hook path once per clone:

```sh
npm run prepare:hooks
```

The pre-commit hook runs the same foundation checks as CI before allowing a commit.

## Epic Decomposition

Preview the planned subissues without changing GitHub:

```sh
npm run decompose:dry-run
```

Create issues in a repository after reviewing the dry run:

```sh
node scripts/decompose-epic.mjs --create --repo xlabtg/Teleton-Client
```

The script creates any missing labels, skips issues with duplicate titles, and preserves the priority order declared in `config/epic-subtasks.json`. Creating labels and issues requires write access to the target repository. If labels are already prepared but the token cannot create labels, use:

```sh
node scripts/decompose-epic.mjs --create --skip-label-create --repo xlabtg/Teleton-Client
```

## Environment

Do not hardcode Telegram API credentials, proxy secrets, TON wallet secrets, cloud model tokens, or agent keys in source files. Use environment variables or platform secure storage references such as `env:TELETON_MTPROTO_SECRET`, `keychain:teleton-agent-token`, or `keystore:ton-wallet`.
