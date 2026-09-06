# AGENT.md — package `packages/state-sqlite`

> Below the `<!-- delendai:begin agent-md -->` marker is
> generated. Edit prose ONLY outside that block — the
> regenerator will replace the block verbatim.

<!-- delendai:begin agent-md -->
## Purpose

- SQLite-specific helpers for the delendai state engine.

## Public API

_(none)_

## Depends on

_(none)_

## Writes

_(none)_

## Entry points

- ./dist/index.js

## Tests

- packages/state-sqlite/src/lib/error-method.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

