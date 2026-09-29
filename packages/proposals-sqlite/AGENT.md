# AGENT.md — package `packages/proposals-sqlite`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- SQLite operational truth for the @delendai/proposals plugin (q00022, x00510).

## Public API

_(none)_

## Depends on

- @delendai/core
- yaml

## Writes

_(none)_

## Entry points

- ./dist/index.js

## Tests

- packages/proposals-sqlite/src/lib/sqlite-driver.spec.ts
- packages/proposals-sqlite/tests/e2e/digest-property.spec.ts
- packages/proposals-sqlite/tests/e2e/digest-rebuild.spec.ts
- packages/proposals-sqlite/tests/e2e/fts.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

