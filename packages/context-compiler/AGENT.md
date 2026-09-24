# AGENT.md — package `packages/context-compiler`

> Below the `<!-- delendai:begin agent-md -->
## Purpose

- Thin context compiler facade over @delendai/state artifacts and derivations.

## Public API

_(none)_

## Depends on

- @delendai/state

## Writes

_(none)_

## Entry points

- ./dist/index.js

## Tests

- packages/context-compiler/src/lib/context-compiler.spec.ts
- packages/context-compiler/tests/src/lib/context-compiler.spec.ts
- packages/context-compiler/tests/src/lib/context-manifest.spec.ts
- packages/context-compiler/tests/src/lib/ref-expander.spec.ts

## Do not

- An agent does not run `git stash`: git refuses it for agents (`delendai guard`, reference-transaction), because every worktree shares one stash and stashed work is invisible to the work model. Commit, or checkpoint to your work ref, instead.
- Do not hand-edit content between `<!-- delendai:begin -->`/`<!-- delendai:end -->` markers; regenerate via the owning `gen:*` script instead.

## Token hotspots

_(none)_

<!-- delendai:end agent-md -->

