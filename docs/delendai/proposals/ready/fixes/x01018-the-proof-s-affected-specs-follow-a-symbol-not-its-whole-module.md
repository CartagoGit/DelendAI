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

The fast proof of f00803 S2 ran about 15 vitest forks at 60% CPU for most of a 15-minute proof. It selects specs with the same analysis the forge uses (`affectedSpecsSince`, since bf41e0108), so local and forge agree, but the analysis itself reaches too far. Measured on 2026-11-03: the S2 diff (17 files) selects 720 specs, and the leaves `classify-origin.ts`, `feature-flags.ts` and `parse-cli-args.ts` select 184, 131 and 192, where the specs named after them are 1 or 2. The reach is module-level after the first hop: a module that imports one changed name is tainted as a whole, so every importer of any other name it exports is affected, and the taint climbs through core into every plugin. The change narrows the taint to the exports whose declaration uses a changed name. This completes q00038 S1's third acceptance line, that the local proof runs the same specs the forge would from the same analysis, by making that one analysis precise. The proof also runs its workers unbounded; it caps them to half the cores, overridable, so the machine stays usable.

## non-goals

- Sharding the local proof: it would run the same work with more parallelism.
- Dropping any spec that really reaches the change.

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
