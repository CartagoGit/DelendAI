---
id: x00520
title: "Context compiler diff reports semantic removals"
kind: fix
status: done
type: proposal
track: architecture
date: 2026-09-07
last-transition-id: 2c378c09-1c3b-43d0-a05f-8c79b7aa28ce
last-correlation-id: 2c378c09-1c3b-43d0-a05f-8c79b7aa28ce
last-transition-from: review
shipped-in: ["f606866b5"]
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
