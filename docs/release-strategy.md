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
- Release validation checks metadata consistency and stable semantic version syntax.
- Publishing is intentionally absent from pull request workflows, so unreviewed pull request code cannot publish packages.
- Future publishing automation should run only from reviewed `main` changes or protected release tags.
