# AGENT.md — package `packages/state-sqlite`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- SQLite-specific helpers for the delendai state engine.

## Public API

_(none)_

## Depends on

- @delendai/state

## Writes

_(none)_

## Entry points

- ./dist/index.js

## Tests

- packages/state-sqlite/src/lib/error-method.spec.ts
- packages/state-sqlite/src/lib/registry-facade.spec.ts
- packages/state-sqlite/src/lib/sqlite-driver.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

