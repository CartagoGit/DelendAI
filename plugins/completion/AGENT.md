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

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

