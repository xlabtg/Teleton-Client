# Release Readiness

Teleton Client cannot be published publicly from the foundation repository until the release readiness checklist below is completed for the reviewed commit. The checklist is intentionally manual at the final gate: automated validation can prove the repository shape, but a human release approval is required before package publication, app-store submission, signed artifact upload, or release tagging.

`src/foundation/release-readiness.mjs` is the machine-readable source for this gate. `npm run validate:release` verifies that the checklist and documentation inventory remain present before release readiness is claimed.

## Release Gate Checklist

| Gate | Required evidence | Human approver |
| --- | --- | --- |
| Tests and Validation Evidence | Record `npm test`, `npm run validate:secrets`, `npm run audit:security`, `npm run validate:foundation`, `npm run validate:release`, `npm run build:debug-artifacts`, and reviewed changelog check results for the exact commit. | Release manager |
| License and Source Publication Review | Confirm `docs/license-matrix.md` matches shipped dependency versions, source URLs, license texts, notices, local patches, and source publication obligations for GPL, LGPL, unclear-license, and mixed-license inputs. | Legal or release maintainer |
| Privacy Policy and Data Flow Review | Compare `PRIVACY.md` against shipped Telegram, proxy, Teleton Agent, settings sync, notification, and TON behavior. Confirm release notes, screenshots, fixtures, and logs do not expose private message content. | Privacy reviewer |
| Security Audit and Vulnerability Intake Review | Attach `security-audit-report.md`, review `SECURITY.md`, confirm private advisory intake, coordinated disclosure, credential rotation, secure storage, diagnostics redaction, and CODEOWNERS review status. | Security maintainer |
| Release Artifact and Signing Review | Attach unsigned public CI debug manifests for Android, iOS, macOS, Windows, and Linux. Confirm signed artifacts are built only from reviewed commits inside the protected `release-signing` environment. | Release manager |
| Documentation Completeness Review | Compare shipped foundation modules and tests against README, BUILD-GUIDE, SECURITY, PRIVACY, architecture, release strategy, packaging, security audit, and license documentation. Current behavior must not be overstated as production behavior. | Documentation owner |
| Human Release Approval | Record explicit human release approval only after every checklist item is complete. Publication, tags, app-store submission, and signed artifact upload stay blocked until this approval is recorded. | Human release approver |

## Documentation Completeness

Documentation is considered release-ready only when it matches the behavior present in the reviewed commit:

- Current behavior must be documented in the same pull request that adds or changes it.
- Planned behavior must be labeled as future work when no implementation exists yet.
- Security, privacy, release automation, platform contracts, and user-visible workflows must link to the documents reviewers are expected to inspect.
- Validation coverage must include either a focused test, release validation rule, foundation validation rule, or an explicit manual review item.
- Screenshots, logs, fixtures, and release notes must be redacted before they are attached to review records.

## Source Publication Requirements

Before public release, reviewers must confirm that every distributed dependency, bundled binary, native library, WebAssembly module, generated SDK, copied reference asset, and local patch has a release record. The record must include the exact version or commit, source URL, license identifier, license text, notice requirements, and source publication decision.

Copyleft and unclear-license inputs remain release-blocking until a human legal reviewer approves the exact reuse model. Reference-only Telegram clients, GPL or LGPL code, and mixed-license repositories must not be copied into distributed artifacts without a written compliance plan.

## Current Behavior Inventory

| Behavior group | Source of truth | Validation | Release documentation |
| --- | --- | --- | --- |
| Release metadata | `src/foundation/release-metadata.mjs` | `test/release-metadata.test.mjs` | `docs/release-strategy.md`, `BUILD-GUIDE.md` |
| Release artifacts | `src/foundation/release-artifacts.mjs` | `test/release-artifacts.test.mjs` | `docs/release-packaging.md`, `BUILD-GUIDE.md` |
| Release readiness | `src/foundation/release-readiness.mjs` | `test/release-readiness.test.mjs` | `docs/release-readiness.md` |
| Security audit | `src/foundation/security-audit.mjs` | `test/security-audit-report.test.mjs` | `docs/security-audit.md` |
| Secret audit | `src/foundation/secret-audit.mjs` | `test/secret-audit.test.mjs` | `docs/security-audit.md` |
| License matrix | `docs/license-matrix.md` | `test/license-compliance.test.mjs` | `docs/license-matrix.md` |
| Privacy policy | `PRIVACY.md` | `test/privacy-policy.test.mjs` | `PRIVACY.md` |
| TDLib adapter | `src/tdlib/client-adapter.mjs` | `test/tdlib-adapter.test.mjs` | `docs/tdlib-adapter.md` |
| Message database storage | `src/tdlib/message-database-storage.mjs` | `test/message-database-storage.test.mjs` | `docs/architecture.md` |
| Settings model | `src/foundation/settings-model.mjs` | `test/settings-model.test.mjs` | `README.md` |
| Proxy connectivity | `src/foundation/proxy-manager.mjs` | `test/proxy-manager.test.mjs` | `README.md` |
| Agent settings | `src/foundation/agent-settings-view.mjs` | `test/agent-settings-view.test.mjs` | `docs/architecture.md` |
| Agent runtime | `src/foundation/agent-runtime-supervisor.mjs` | `test/agent-runtime-supervisor.test.mjs` | `README.md` |
| TON wallet | `src/ton/wallet-adapter.mjs` | `test/ton-adapter.test.mjs` | `README.md` |
| Android wrapper | `src/platform/android-wrapper.mjs` | `test/android-wrapper.test.mjs` | `docs/android-wrapper.md` |
| E2E workflow harness | `src/foundation/e2e-workflow-harness.mjs` | `test/e2e-workflow-harness.test.mjs` | `BUILD-GUIDE.md` |

This inventory is not the full product roadmap. It is the release-review slice that proves current foundation behavior is documented, tested, and separated from future production implementation claims.
