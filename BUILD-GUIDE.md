# Build Guide

Teleton Client is currently in the repository foundation phase. The present codebase provides the issue decomposition workflow, validation scripts, and small shared configuration models that future platform implementations will build on.

## Requirements

- Node.js 20 or newer.
- GitHub CLI (`gh`) for creating GitHub issues from the epic backlog.
- A GitHub account with write access to `xlabtg/Teleton-Client` when running issue creation.

## Local Checks

Run the same checks used by CI:

```sh
npm test
npm run validate:foundation
npm run decompose:dry-run
```

No dependency installation is required for the current foundation package because it uses only Node.js built-ins.

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
