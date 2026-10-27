---
id: x00520
title: "Context compiler diff reports semantic removals"
kind: fix
status: done
type: proposal
track: architecture
date: 2026-09-07
last-transition-id: bf6d0bab-9ca7-46a1-ab6f-29256802bdf6
last-correlation-id: bf6d0bab-9ca7-46a1-ab6f-29256802bdf6
last-transition-from: review
shipped-in:
  - "274aa781bb4bdf62040674e1e0b655c1a73d11ed"
---

# x00520 — Context compiler diff reports semantic removals

## Goal

Corregir ContextCompiler.diff para representar eliminaciones y cambios de referencias de forma completa y determinista.

## why

La implementación actual solo emite refs presentes en after, por lo que no puede invalidar contexto eliminado.

## non-goals

- No implementar aún el compilador L0-L5 de f00517.
- No introducir embeddings ni LLM.

## Slices

- global_gate: type

### S1 — Represent added changed removed refs
- **Status**: done
- shipped-in: `274aa781b`
- **Files**: `packages/context-compiler/src`, `packages/context-compiler/tests`
- **Gate**: type
- acceptance:
  - "diff representa added, changed y removed o tombstones equivalentes."
  - "Las eliminaciones siempre aparecen."
  - "El orden es determinista y no duplica hashes."
- review-state: done
- review-implementer: unrecorded
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — ContextCompiler.diff now computes removedRefs (refs in before not in after), merges with changedManifest.refs, sorts by stableRefIdentity.compareRefs, and rehashes via calculateManifestHash(refs, summary). Additions fall into changedRefs (ref present in after not in before); changes fall into changedRefs by contentHash diff. Determinism and dedup verified by 'uses the canonical hash of refs plus summary' + 'deterministic order'. Spec: 7/7 pass.
- review-attribution: unrecorded — nothing in Git names who delivered 274aa781bb4bdf62040674e1e0b655c1a73d11ed: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by minimax-m3

## acceptance

- diff representa added, changed y removed o tombstones equivalentes.
- Las eliminaciones siempre aparecen.
- El orden es determinista y no duplica hashes.
