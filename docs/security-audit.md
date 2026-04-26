# Security Audit

This audit records the current token, key, rotation, and secure storage requirements for the foundation repository. The current codebase has no production client, native secure storage implementation, or live service credentials; shared code must keep sensitive values behind secure references until platform wrappers resolve them locally.

## Automated Secret Scan

Run the repository secret scan locally and in CI:

```sh
npm run validate:secrets
```

The scan reads git-tracked text files and rejects high-confidence committed secret patterns, including private key blocks, Telegram `api_id` or `api_hash` assignments, Telegram bot tokens, GitHub tokens, Slack tokens, OpenAI keys, AWS access key ids, Google API keys, and npm tokens. Findings are redacted in command output so CI logs do not repeat the suspected secret value.

The only allowlisted matches are synthetic fixtures in redaction tests. New allowlist entries require a narrow file path, pattern id, line marker, and human maintainer review.

## Release Audit Report

Generate attachable release-review evidence with:

```sh
npm run audit:security -- --output security-audit-report.md
```

The generated Markdown report records the release gate status, automated security checks, redacted secret findings if any are found, and manual release sign-off checkboxes. CI runs the same command, and the release validation workflow uploads `security-audit-report.md` as a review artifact even when audit checks fail.

| Audit category | Automated evidence | Required human evidence |
| --- | --- | --- |
| Secrets | `npm run validate:secrets` scans git-tracked text files and fails on common secret patterns. | Security reviewer confirms credential rotation, secure storage, logs, screenshots, fixtures, pull request text, and release notes are redacted. |
| Dependency risk | `package.json` dependency metadata and lockfile coverage are checked, and `docs/license-matrix.md` must track upstream license and source publication obligations. | Legal or release reviewer confirms selected dependencies match the license matrix and approves TDLib, Telegram reference, Teleton Agent, TON SDK, copyleft, notice, and app-store obligations. |
| Permission boundaries | CODEOWNERS coverage, workflow `contents: read` permissions, secure storage review language, and non-publishing release validation are checked. | Security reviewer confirms platform bridges resolve secrets locally, redact diagnostics, and keep elevated permissions out of unreviewed pull request workflows. |
| Release readiness | `npm run validate:release`, package private state, the audit command, and release workflow artifact generation are checked. | Release manager attaches the report, records validation results, confirms changelog redaction, and keeps publication disabled until public release approval. |

Manual review items must be completed before public release even when automated checks pass.

## Credential Inventory

| Credential source | Current owner boundary | Required storage | Rotation trigger |
| --- | --- | --- | --- |
| Telegram API credentials, including `api_id`, `api_hash`, phone numbers, bot tokens, two-factor passwords, and recovery codes | `src/tdlib/client-adapter.mjs` accepts credential references only; `src/tdlib/two-factor-auth.mjs` keeps two-factor drafts runtime-only. Native TDLib bridges resolve stored references and submit two-factor values directly to TDLib. | Environment variables, Keychain, Keystore, secret manager, or equivalent platform secure storage for stored credentials; in-memory prompt values only for two-factor password and recovery-code submissions. | Leak suspicion, offboarding, vendor policy change, app registration replacement, two-factor recovery event, or release security review finding. |
| MTProto, SOCKS5, and HTTP CONNECT proxy credentials | Proxy settings models and TDLib proxy commands store only `secretRef`, `usernameRef`, and `passwordRef`. | Environment variables, Keychain, Keystore, or user-managed secret entries. | Proxy provider change, failed access review, suspicious proxy test logs, or shared-device transfer. |
| LLM provider API keys and bearer tokens | Agent provider configuration requires `apiKeyRef` or `tokenRef` for cloud and custom providers. | Keychain, Keystore, environment variables, or managed secret references resolved outside shared settings. | Provider key rotation policy, cloud-mode disablement, compromised endpoint, or maintainer offboarding. |
| TON wallet private keys, mnemonics, and provider credentials | TON adapters reject private key fields and accept wallet provider or secure storage references only. | Wallet provider, hardware wallet, platform secure storage, or protected CI secret for testnet-only references. | Wallet provider change, testnet provider replacement, compromise suspicion, or release-blocking financial review. |
| Hardware security key credential ids, attestation, and assertion payloads | `src/foundation/hardware-security-key.mjs` stores only safe ceremony summaries. Platform and verification bridges own WebAuthn/FIDO public-key credential creation, challenge handling, attestation, assertion signatures, and verification. | Credential ids may be local metadata; attestation objects, client data JSON, authenticator data, signatures, and server challenges stay in platform or server-side verification bridges and must not be written to shared settings or logs. | Authenticator loss, account recovery, relying-party id or origin change, suspicious assertion failure, platform bridge replacement, or release security review finding. |
| Agent memory encryption keys | `src/foundation/agent-memory-store.mjs` creates or reads AES-256-GCM data keys from platform secure storage. | iOS Keychain, Android Keystore, desktop OS credential vault, or browser non-extractable WebCrypto-backed storage where available. | Device reenrollment, locked or missing key recovery, storage migration, or release security review. |
| Settings sync encryption keys | Settings sync stores only local key references and excludes sync key material from payloads. | Device-local secure storage; each device resolves its own key. | Device removal, sync transport replacement, missing-key recovery, or suspected remote snapshot exposure. |
| GitHub and CI tokens | GitHub Actions uses platform-provided tokens for validation and changelog preview. | GitHub protected repository or environment secrets; never committed files. | Maintainer offboarding, repository permission changes, failed CI audit, or GitHub security alert. |

## Credential Rotation

Use this sequence for every credential class:

1. Create the replacement credential outside the repository.
2. Store it in the platform secure storage location or protected CI secret that backs the existing reference name, or add a new reviewed reference name.
3. Deploy or run the affected platform bridge so it resolves the new value without logging it.
4. Run `npm run validate:secrets`, `npm test`, and the affected integration check.
5. Revoke or delete the old credential at the provider.
6. Review recent CI logs, issue comments, pull request text, screenshots, and fixtures for accidental disclosure.
7. Record the rotation date, credential class, reference name, and reviewer in the private security record. Do not record the secret value.

Telegram app credentials should be replaced through the Telegram developer account or vendor-approved app registration process, then updated behind `apiIdRef` and `apiHashRef`. LLM, proxy, TON, and CI credentials should follow the provider's revocation flow and preserve the same shared reference shape whenever possible so settings snapshots do not need plaintext migration.

## Secure Storage Review

| Platform | Required secure storage behavior | Current review status |
| --- | --- | --- |
| Android | Resolve references through Android Keystore or app-private encrypted storage; never return raw values to shared logs or settings exports. | Wrapper contract only; native Keystore binding must be reviewed before release. |
| iOS | Use Keychain Services with device-local accessibility for TDLib, proxy, agent, sync, and TON references. | Wrapper contract documents Keychain references; concrete Xcode implementation must be reviewed before release. |
| Desktop | Use the OS credential vault through a native bridge, such as Keychain on macOS, Credential Manager on Windows, or Secret Service/libsecret on Linux. | Electron wrapper contract only; native credential bridge and IPC redaction need review before release. |
| Web | Prefer no long-lived secrets in browser storage. When a browser-only fallback is unavoidable, use non-extractable WebCrypto keys with IndexedDB metadata and require reauthentication when secure storage is unavailable. | PWA contract documents progressive fallback limits; browser storage hardening must be reviewed before release. |
| Hardware security keys | Check platform capability flags before showing registration or assertion prompts. Web uses WebAuthn `PublicKeyCredential`, iOS uses AuthenticationServices public-key credential providers, Android uses Credential Manager public-key credential APIs, and desktop uses renderer WebAuthn or a reviewed native FIDO2 bridge. | Shared foundation contract only; native platform bridges, relying-party binding, attestation policy, fallback copy, and diagnostics redaction require human security review before release enablement. |
| CI | Keep live secrets out of pull_request jobs from forks and resolve testnet-only references only in protected environments. | Current foundation CI does not require live secrets; future live jobs must be reviewed before enablement. |

Release enablement is blocked until a human security review confirms that each platform implementation resolves references locally, redacts diagnostics, supports rotation or reenrollment, and keeps exported settings free of raw credential material.

## Human Security Review

Security and privacy changes require CODEOWNERS review by a human maintainer. Before release, request a human security review that covers:

- The latest `npm run validate:secrets`, `npm test`, `npm run validate:foundation`, and `npm run validate:release` results.
- Any changes to secret patterns or allowlisted fixtures.
- Platform secure storage bindings and diagnostic redaction behavior.
- Hardware security key platform capability detection, relying-party id and origin binding, registration and assertion verification boundaries, explicit fallback behavior, and release enablement flags.
- Credential rotation notes for Telegram, proxy, LLM provider, TON, agent memory, sync, and CI credentials.
- Confirmation that release notes, screenshots, fixtures, logs, and pull request text do not include secrets or private message content.
