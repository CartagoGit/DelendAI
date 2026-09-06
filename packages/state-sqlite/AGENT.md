# AGENT.md — package `packages/state-sqlite`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- delendai package packages/state-sqlite

## Public API

_(none)_

## Depends on

_(none)_

## Writes

_(none)_

## Entry points

_(none)_

## Tests

- packages/state-sqlite/src/lib/error-method.spec.ts
- packages/state-sqlite/src/lib/registry-facade.spec.ts
- packages/state-sqlite/src/lib/sqlite-driver.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

