# Contribution Templates

Teleton Client uses GitHub templates to keep issues and pull requests reproducible, reviewable, and safe to discuss publicly.

## Feature Task Issues

Use the feature task template for planned product, platform, infrastructure, documentation, or testing work. Define the goal, bounded scope, acceptance criteria, project area, and testing plan before implementation starts.

## Bug Report Issues

Use the bug report template for defects with observable expected and actual behavior. Include the smallest reliable reproduction, environment details, redacted logs, and the tests or checks already tried.

## Generated Subtasks

Use the implementation subtask template for tasks decomposed from the Teleton Client foundation epic. Keep the parent epic, phase, scope, acceptance criteria, and testing notes aligned with `config/epic-subtasks.json`.

## Pull Requests

Pull requests should summarize the change, link the issue, list tests, call out risks, and include screenshots or recordings for UI work. PR descriptions should stay current as implementation details change.

Never include secrets, production credentials, access tokens, Telegram API hashes, private keys, or private message content in issues, pull requests, logs, screenshots, or fixtures.

## Ownership Rules

Repository ownership is defined in `.github/CODEOWNERS`. Changes to security and privacy documentation, CI and release automation, package metadata, platform integration boundaries, shared client code, and CODEOWNERS itself must be reviewed by a human maintainer before merge.

When ownership needs to change, update `.github/CODEOWNERS` in the same pull request as the related repository-area change and explain why the new owner mapping is appropriate.
