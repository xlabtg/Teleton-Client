# Contributing

Teleton Client is in the repository foundation phase. Contributions should keep the project easy to validate, safe to review publicly, and aligned with the documented architecture.

## Local Setup

Use Node.js 20 or newer. The current foundation package uses only Node.js built-ins, so no dependency installation is required before running the checks.

Start with:

```sh
npm test
npm run validate:secrets
npm run audit:security
npm run validate:foundation
npm run validate:release
npm run decompose:dry-run
```

Enable the repository pre-commit hook once per clone:

```sh
npm run prepare:hooks
```

See `BUILD-GUIDE.md` for build requirements, validation commands, release metadata expectations, and the epic decomposition workflow.

## Choosing Work

Use the GitHub issue templates for new feature tasks and bug reports. Generated implementation subtasks should stay aligned with the parent epic, phase, scope, acceptance criteria, and testing notes recorded in `config/epic-subtasks.json`.

Before starting work, read the related issue, linked documentation, and any existing pull request discussion. If the issue is unclear, ask for clarification before implementing.

## Branches, Commits, and Pull Requests

Create a branch for each bounded change. Keep commits focused, reviewable, and useful on their own when possible. Do not mix unrelated refactors, formatting churn, or generated artifact updates into a feature or bug-fix commit unless they are required for the change.

Pull requests should:

- Link the issue they resolve.
- Summarize the implementation and any non-obvious tradeoffs.
- List the local validation commands that were run.
- Call out risks, follow-up work, or manual checks.
- Include screenshots or recordings for UI changes.
- Stay current as the implementation changes.

Use `.github/pull_request_template.md` for the required sections. See `docs/contributing-templates.md` for issue and pull request template expectations, including ownership review rules.

## Validation

Run the same checks used by CI before opening a pull request and again before asking for review:

```sh
npm test
npm run validate:secrets
npm run audit:security
npm run validate:foundation
npm run validate:release
npm run decompose:dry-run
```

For bug fixes, add the smallest automated test that reproduces the issue before the fix. For documentation-only changes, update or add validation coverage when a stable repository rule can be checked automatically.

## Security and Privacy

Never commit or post secrets, production credentials, access tokens, Telegram API IDs or hashes, MTProto secrets, proxy credentials, TON wallet private keys, private message content, or unredacted logs.

Represent sensitive runtime values through environment variables or secure storage references such as `env:TELETON_MTPROTO_SECRET`, `keychain:teleton-agent-token`, or `keystore:ton-wallet`.

Public issues, pull requests, screenshots, fixtures, and logs must be redacted before sharing. Report vulnerabilities through GitHub private security advisories instead of public issues.

Run `npm run validate:secrets` before publishing a branch. The scan rejects high-confidence secret patterns in committed files and redacts findings in command output. Credential inventory, rotation, secure storage review requirements, and release review steps are documented in `docs/security-audit.md`.

Run `npm run audit:security -- --output security-audit-report.md` during release preparation to generate attachable Markdown evidence for secrets, dependency risk, permission boundaries, release readiness, and required manual sign-offs.

Security, privacy, CI, release automation, package metadata, shared client code, and CODEOWNERS changes require human maintainer review according to `.github/CODEOWNERS`.

## Project Documentation

Use these documents as the source of truth for foundation work:

- `README.md` for the current repository status and quick start.
- `BUILD-GUIDE.md` for local checks, release metadata, and build expectations.
- `PRIVACY.md` for data handling principles and security reporting.
- `docs/security-audit.md` for secret scanning, credential rotation, and secure storage review requirements.
- `docs/license-matrix.md` for TDLib, Telegram reference client, Teleton Agent, and TON SDK license obligations before release readiness.
- `docs/architecture.md` for planned layers and integration boundaries.
- `docs/tdlib-adapter.md` for TDLib adapter and credential handling rules.
- `docs/release-strategy.md` for release metadata policy.
- `docs/backlog.md` and `config/epic-subtasks.json` for planned foundation work.
