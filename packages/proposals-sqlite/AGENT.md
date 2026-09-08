# AGENT.md — package `packages/proposals-sqlite`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- SQLite operational truth for the @delendai/proposals plugin (q00022, x00510).

## Public API

_(none)_

## Depends on

- @delendai/core

## Writes

_(none)_

## Entry points

- ./dist/index.js

## Tests

- packages/proposals-sqlite/src/lib/sqlite-driver.spec.ts
- packages/proposals-sqlite/tests/e2e/digest-property.spec.ts
- packages/proposals-sqlite/tests/e2e/digest-rebuild.spec.ts
- packages/proposals-sqlite/tests/e2e/outbox-retry.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

