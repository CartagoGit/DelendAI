---
id: x01018
title: "The proof's affected specs follow a symbol, not its whole module"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-11-03
---

# x01018 — The proof's affected specs follow a symbol, not its whole module

## goal

The shared affected-specs analysis taints the exports that use a changed symbol instead of every export of the module that imports it, and the local proof caps its vitest workers.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — Symbol-level reach and a worker cap
- **Status**: pending
- **Files**: `tools/scripts/ci/affected-specs.service.ts`, `tools/scripts/ci/affected-specs.interface.ts`, `tools/scripts/ci/affected-specs.service.spec.ts`, `tools/scripts/ci/prove-plan.script.ts`
- **Gate**: none
- acceptance:
  - "The analysis taints only the exports whose declaration uses a changed or tainted name: a leaf behind a barrel, a changed re-exported symbol and a module with load-time effects each reach exactly the specs that import them, and the local proof runs the same specs the forge would; vitest workers are capped to half the cores unless DELENDAI_PROVE_WORKERS says otherwise."

## acceptance

- The analysis taints only the exports whose declaration uses a changed or tainted name: a leaf behind a barrel, a changed re-exported symbol and a module with load-time effects each reach exactly the specs that import them, and the local proof runs the same specs the forge would; vitest workers are capped to half the cores unless DELENDAI_PROVE_WORKERS says otherwise.
