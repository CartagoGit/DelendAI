# AGENT.md — package `packages/state`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Pure-TypeScript State Engine contracts + in-memory driver. Phase 0 of q00018. NO Node imports in the contracts surface, NO @delendai/core dependency. Phase 1 will introduce `@delendai/state-sqlite` (separate package) behind the same `IStateRegistry` contract.

## Public API

_(none)_

## Depends on

_(none)_

## Writes

_(none)_

## Entry points

- ./dist/index.js

## Tests

- packages/state/tests/src/fingerprint.spec.ts
- packages/state/tests/src/generation.spec.ts
- packages/state/tests/src/hash.spec.ts
- packages/state/tests/src/no-node-imports.spec.ts

## Do not

- Do not run `git stash`; this repo forbids stashes (see `tools/scripts/lint/no-stashes.script.ts`) — a shared worktree can lose another agent's stashed work.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

