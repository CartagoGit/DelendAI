# AGENT.md — package `packages/state`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Pure-TypeScript State Engine contracts + in-memory driver. Phase 0 of q00018. NO Node imports in the contracts surface, NO @delendai/core dependency. Phase 1 will introduce `@delendai/state-sqlite` (separate package) behind the same `IStateRegistry` contract.

## Public API

_(none)_

## Depends on

- @delendai/contracts

## Writes

_(none)_

## Entry points

- ./dist/index.js

## Tests

- packages/state/tests/src/digest-honesty.spec.ts
- packages/state/tests/src/digest-mismatch.spec.ts
- packages/state/tests/src/failure-reasons.spec.ts
- packages/state/tests/src/fingerprint.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

