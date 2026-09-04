# AGENT.md — package `packages/contracts`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Pure-TypeScript type-only contracts shared across the delendai ecosystem. NO Node imports, NO @delendai/core dependency. Plugins and external consumers can depend on this package without dragging in the runtime weight of `@delendai/core`.

## Public API

_(none)_

## Depends on

_(none)_

## Writes

_(none)_

## Entry points

- ./dist/index.js

## Tests

- packages/contracts/tests/src/capability-graph.spec.ts
- packages/contracts/tests/src/envelopes.spec.ts
- packages/contracts/tests/src/no-node-imports.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

