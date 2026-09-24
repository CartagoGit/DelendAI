# AGENT.md — plugin `plugins/completion`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Task-completion notifier: records an agent declaring its original task done + reviewed and pushes a notification.

## Public API

- default
- createCompletionStore
- recordFileName
- recordPath
- buildClearRegistration
- buildReportCompleteRegistration
- buildStatusRegistration

## Depends on

- @modelcontextprotocol/sdk
- zod
- @delendai/core

## Writes

- <host workspace>/.delendai/cache/completion/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/completion/tests/src/lib/completion-store.spec.ts
- plugins/completion/tests/src/lib/completion-tools.spec.ts
- plugins/completion/tests/src/plugin-register.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

