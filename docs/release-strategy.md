# Release Strategy

Teleton Client uses `package.json` as the single source of truth for package, application, and release metadata during the foundation phase.

## Version Source

- `package.json` owns the canonical `name`, `version`, and `private` package metadata.
- `src/foundation/release-metadata.mjs` exposes a small runtime snapshot used by tests and future app wrappers.
- `scripts/validate-release.mjs` verifies that runtime release metadata matches `package.json`.

The package remains private until a reviewed release workflow is introduced. Pull requests and issue branches can validate metadata, but they do not publish packages.

## Package Artifact Matrix

`src/foundation/release-artifacts.mjs` defines the reviewed package matrix for Android APK, iOS IPA, macOS DMG, Windows EXE, and Linux AppImage targets. Public pull request CI builds unsigned debug artifact manifests for every supported platform runner and uploads those manifests as review evidence.

See `docs/release-packaging.md` for the artifact paths, runner matrix, protected signing boundary, and publication checklist. Pull requests do not receive signing secrets; signed packages must be produced only from reviewed commits inside the protected `release-signing` environment.

## Semantic Versioning

Versions must use stable semantic version format: `MAJOR.MINOR.PATCH`.

- Patch releases increment only `PATCH`.
- Minor releases increment `MINOR` and reset `PATCH` to `0`.
- Major releases increment `MAJOR` and reset `MINOR` and `PATCH` to `0`.
- Prerelease and build metadata are not accepted by foundation validation.

The helper `classifyVersionBump(previousVersion, nextVersion)` records these rules for future release automation.

## Automation Rules

- CI runs `npm run validate:release` for pull requests and pushes to `main` or `issue-*` branches.
- CI runs `npm run build:debug-artifacts` for Android, iOS, macOS, Windows, and Linux debug artifact manifests, then uploads the unsigned manifests for review.
- CI previews generated changelog notes with `npm run changelog` so reviewers can inspect the release-note format before publication.
- Release validation checks metadata consistency and stable semantic version syntax.
- Publishing is intentionally absent from pull request workflows, so unreviewed pull request code cannot publish packages.
- Future publishing automation should run only from reviewed `main` changes or protected release tags.

## Security Policy Review

Before release readiness is claimed, a human maintainer must review `SECURITY.md` and confirm that supported versions, GitHub private security advisory intake, private report expectations, coordinated disclosure timing, and credential rotation guidance match the release being prepared.

Security fixes and release notes must be checked against the security policy before publication. Advisory identifiers, reproduction details, reporter information, logs, screenshots, and exploit details should stay private until coordinated disclosure is approved.

## Changelog Workflow

Run `npm run changelog` to print release notes for the current `package.json` version from merged pull requests on `main`. The generated notes group entries by pull request labels and include links to merged pull requests plus issue references found in pull request text such as `Fixes #38`.

Run `npm run changelog:write -- --version 0.2.0` to prepend generated notes to `CHANGELOG.md`. The script redacts common token formats in pull request titles, but maintainers must review the generated notes before publishing and confirm that titles, links, logs, and references do not expose secrets, Telegram API hashes, private keys, production credentials, or private message content.

Use `npm run changelog:check` in release preparation after `CHANGELOG.md` has been reviewed. The check fails when the reviewed changelog does not contain the generated release-note lines for the target version.
