# Release Strategy

Teleton Client uses `package.json` as the single source of truth for package, application, and release metadata during the foundation phase.

## Version Source

- `package.json` owns the canonical `name`, `version`, and `private` package metadata.
- `src/foundation/release-metadata.mjs` exposes a small runtime snapshot used by tests and future app wrappers.
- `scripts/validate-release.mjs` verifies that runtime release metadata matches `package.json`.

The package remains private until a reviewed release workflow is introduced. Pull requests and issue branches can validate metadata, but they do not publish packages.

## Semantic Versioning

Versions must use stable semantic version format: `MAJOR.MINOR.PATCH`.

- Patch releases increment only `PATCH`.
- Minor releases increment `MINOR` and reset `PATCH` to `0`.
- Major releases increment `MAJOR` and reset `MINOR` and `PATCH` to `0`.
- Prerelease and build metadata are not accepted by foundation validation.

The helper `classifyVersionBump(previousVersion, nextVersion)` records these rules for future release automation.

## Automation Rules

- CI runs `npm run validate:release` for pull requests and pushes to `main` or `issue-*` branches.
- CI previews generated changelog notes with `npm run changelog` so reviewers can inspect the release-note format before publication.
- Release validation checks metadata consistency and stable semantic version syntax.
- Publishing is intentionally absent from pull request workflows, so unreviewed pull request code cannot publish packages.
- Future publishing automation should run only from reviewed `main` changes or protected release tags.

## Changelog Workflow

Run `npm run changelog` to print release notes for the current `package.json` version from merged pull requests on `main`. The generated notes group entries by pull request labels and include links to merged pull requests plus issue references found in pull request text such as `Fixes #38`.

Run `npm run changelog:write -- --version 0.2.0` to prepend generated notes to `CHANGELOG.md`. The script redacts common token formats in pull request titles, but maintainers must review the generated notes before publishing and confirm that titles, links, logs, and references do not expose secrets, Telegram API hashes, private keys, production credentials, or private message content.

Use `npm run changelog:check` in release preparation after `CHANGELOG.md` has been reviewed. The check fails when the reviewed changelog does not contain the generated release-note lines for the target version.
