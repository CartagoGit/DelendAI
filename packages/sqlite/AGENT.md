# AGENT.md — package `packages/sqlite`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- The one cross-runtime SQLite loader for delendai: `bun:sqlite` under Bun, `node:sqlite` behind the same Database shape under Node 22.5+.

## Public API

_(none)_

## Depends on

_(none)_

## Writes

_(none)_

## Entry points

- ./dist/index.js

## Tests

- packages/sqlite/tests/src/lib/load-database-class.helper.spec.ts
- packages/sqlite/tests/src/lib/node-sqlite-database.helper.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

