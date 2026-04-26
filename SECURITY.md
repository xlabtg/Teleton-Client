# Security Policy

Teleton Client is in the repository foundation phase. This policy defines how security reports are handled before a production client or public release channel exists.

## Supported Versions

| Version or branch | Support status |
| --- | --- |
| `main` branch | Supported for foundation security fixes, policy updates, and release-readiness documentation. |
| Latest tagged release | No public release exists yet. The first reviewed release must define the supported version window before publication. |
| Older issue branches, forks, or local builds | Not supported for coordinated fixes. Rebase or upgrade to the current `main` branch before reporting whether a finding is still present. |

Security fixes are prepared against the current supported version line. If a future release creates maintained patch lines, this table must be updated in the same pull request as the release policy change.

## Reporting a Vulnerability

Report vulnerabilities through GitHub private security advisories for this repository. Do not open a public issue, discussion, pull request, or log upload for suspected vulnerabilities.

Include enough detail for maintainers to reproduce and triage safely:

- Affected branch, commit, platform wrapper, or planned integration area.
- Impact, expected attacker capability, and whether user data, credentials, wallet operations, or agent actions are involved.
- Minimal reproduction steps, proof-of-concept inputs, and redacted logs or screenshots.
- Whether the issue may have exposed secrets, private message content, wallet material, or infrastructure credentials.

If a private advisory is unavailable, ask a maintainer for a private intake channel without sharing vulnerability details in public.

## Private Report Expectations

Keep reports private until maintainers coordinate disclosure. Public project areas must not contain production credentials, access tokens, Telegram API IDs or hashes, proxy credentials, LLM provider tokens, TON private keys, seed phrases, private message content, unredacted logs, or exploitable proof-of-concept details.

Use secure references such as `env:NAME`, `keychain:name`, `keystore:name`, or `secret:name` in examples. Replace credential values, user identifiers, chat content, wallet signing material, and endpoint secrets with redacted placeholders before attaching evidence.

Maintainers must keep advisory discussions, reproduction details, patch timing, and reporter contact information within the private advisory or another approved private channel until coordinated disclosure is complete.

## Disclosure Timeline

Maintainers should acknowledge a new private report within three business days and provide an initial triage update within seven calendar days when enough information is available. Severe findings that could expose credentials, private message content, wallet material, or unsafe agent actions should be prioritized ahead of routine foundation work.

Disclosure timing depends on severity, exploitability, release status, and whether users need a fix, mitigation, or credential rotation guidance. Coordinated disclosure should happen only after maintainers have prepared the fix or mitigation, reviewed release notes for redaction, and agreed with the reporter on what can be public.

If a report identifies leaked credentials or private data, maintainers should rotate affected credentials, review recent logs and pull request text, and document the rotation in the private security record before public disclosure.

## Maintainer Review

Human maintainer review is required before release for this security policy, supported version guidance, private vulnerability intake, disclosure notes, and any fix that changes security-sensitive behavior.

Before declaring release readiness, maintainers must confirm that:

- `SECURITY.md`, `PRIVACY.md`, `CONTRIBUTING.md`, and release documentation describe the same reporting and disclosure process.
- GitHub private security advisories or an approved private intake channel are available.
- Supported versions are current for the release being prepared.
- Security fixes, release notes, screenshots, fixtures, pull request text, and CI logs are redacted and do not expose secrets or private message content.
