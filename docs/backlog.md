# Epic Backlog

The canonical backlog lives in `config/epic-subtasks.json`. Use the JSON manifest for automation and this document for reviewer orientation.

## Priority Order

1. Infrastructure and Core
2. Connectivity Layer
3. Teleton Agent Integration
4. TON Blockchain Module
5. Platform Wrappers
6. Security and Licenses
7. Testing and Release

## Decomposition Workflow

Preview generated issues:

```sh
npm run decompose:dry-run
```

Create missing issues in the upstream repository:

```sh
node scripts/decompose-epic.mjs --create --repo xlabtg/Teleton-Client
```

The script reads the manifest, creates missing labels, skips duplicate issue titles, and opens issues in priority order.

## Published Issues

The epic decomposition has been completed for `xlabtg/Teleton-Client`. Manifest entries now record the published `issueNumber` and `issueUrl` for the original issues `#5` through `#29` and the follow-up expansion issues `#33` through `#70`, so future automation can reconcile by title and keep links stable.

## First Execution Target

The first generated task is `[001] Configure repository structure, CI, linters, and pre-commit`. This repository foundation PR implements that task's initial version by adding documents, validation, CI, issue templates, and a tested manifest.
