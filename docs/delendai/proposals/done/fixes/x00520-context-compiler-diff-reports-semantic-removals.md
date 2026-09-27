---
id: x00520
title: "Context compiler diff reports semantic removals"
kind: fix
status: review
type: proposal
track: architecture
date: 2026-09-07
last-transition-id: 53baf069-c109-4b46-a31f-5a1998c77065
last-correlation-id: 53baf069-c109-4b46-a31f-5a1998c77065
last-transition-from: in-progress
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
- **Files**: `packages/context-compiler/src`, `packages/context-compiler/tests`
- **Gate**: type
- acceptance:
  - "diff representa added, changed y removed o tombstones equivalentes."
  - "Las eliminaciones siempre aparecen."
  - "El orden es determinista y no duplica hashes."
- review-state: done
- review-implementer: github-copilot
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Revisión independiente aprobada. diff representa added/changed/removed con identidad y orden deterministas; removals conservan tombstone sin contentHash. Commit 274aa781b; 5/5 tests focalizados verdes y typecheck de context-compiler correcto.
## acceptance

- diff representa added, changed y removed o tombstones equivalentes.
- Las eliminaciones siempre aparecen.
- El orden es determinista y no duplica hashes.
