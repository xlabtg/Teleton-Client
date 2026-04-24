# Decision 0001: Repository Foundation

## Status

Accepted

## Context

Issue `#1` is an epic that asks for a cross-platform messenger with TDLib, Teleton Agent, TON, proxy support, privacy controls, documentation, and CI. Delivering all runtime functionality in one pull request would make review and verification impractical.

## Decision

Start with a repository foundation that makes the epic executable:

- Keep the current package dependency-free.
- Store the epic decomposition in a machine-readable JSON manifest.
- Provide a dry-run-first issue creation script.
- Add tests that validate required foundation artifacts and shared settings models.
- Add CI that runs the local validation commands.

## Consequences

The PR does not claim to ship a production messenger. It creates the structure and automation needed to split the epic into reviewable implementation tasks while preserving the privacy and credential-handling constraints from the start.
