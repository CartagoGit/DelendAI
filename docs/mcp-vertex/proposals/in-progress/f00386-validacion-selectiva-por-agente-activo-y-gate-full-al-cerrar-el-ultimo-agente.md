---
id: f00386
title: "Validación selectiva por agente activo y gate full al cerrar el último agente"
kind: feat
status: in-progress
type: proposal
track: parallel-validation
date: 2026-08-30
---

# f00386 — Validación selectiva por agente activo y gate full al cerrar el último agente

## Goal

TODO: describe the goal.

## why

TODO: why this work matters now.

## non-goals

- TODO: what this proposal deliberately skips.

## Slices

- global_gate: type

### S1 — Contrato y resolvers de actividad y alcance
- **Status**: done
- **Files**: `plugins/proposals/src/lib/swarm/validation-activity.types.ts`, `plugins/proposals/src/lib/swarm/validation-activity.resolver.ts`, `plugins/quality/src/lib/services/scoped-validation.types.ts`, `plugins/quality/src/lib/services/scoped-validation.resolver.ts`
- **Gate**: `bunx tsc --noEmit -p tsconfig.json`
- Implementar el contrato tipado para decidir validación `scoped`, `full` o `blocked` a partir de actividad, locks y worktrees.
- Derivar scopes seguros desde los archivos propios de una slice y aplicar fallback universal sólo cuando esté configurado explícitamente.
- Añadir tests para deduplicación, señales stale/corruptas, snapshot estable y fallback conservador.
- review-state: done
- review-implementer: f00386-s1-repair
- review-reviewer: technical_investigator
- review-log: requested_changes by delivery_verifier — La revisión independiente exige corregir identidad de branch ambigua, estabilizar snapshotId frente al orden de entradas, degradar close a scoped cuando falta una fuente pero existe otro actor activo, y añadir tests unitarios directos para los tres casos.
- review-log: approved by technical_investigator — Revisión independiente posterior a los cambios: identidad ambigua corregida, snapshotId estable, degradación scoped con fuente missing y suites focalizadas 4/4; Biome y typechecks limpios.
## acceptance

- TODO: observable acceptance criteria.
