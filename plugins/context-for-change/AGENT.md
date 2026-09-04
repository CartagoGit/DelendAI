# AGENT.md — plugin `plugins/context-for-change`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Compact task-oriented change context orchestration across diff, symbols, tests, docs and conventions.

## Public API

- default
- buildContextForChangeToolRegistrations
- ContextForChangeOutputSchema
- runContextForChange

## Depends on

- @delendai/conventions
- @delendai/docs
- @delendai/git
- @delendai/memory
- @delendai/refactor
- @delendai/search
- @delendai/test-policy
- @modelcontextprotocol/sdk

## Writes

- <host workspace>/.delendai/cache/context-for-change/

## Entry points

- ./dist/index.js
- src/index.ts (default export → IMcpPlugin)

## Tests

- plugins/context-for-change/tests/src/context-for-change.tool.spec.ts
- plugins/context-for-change/tests/src/lib/services/context-for-change-format.service.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.
- Do not import `@delendai/core/lib/...`; use `@delendai/core/public`.
- Do not run user-facing shell or destructive tools without `dryRunSupported: true`.
- Do not surface absolute host paths; use `workspaceRoot`-relative paths only.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

