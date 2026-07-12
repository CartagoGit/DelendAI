---
id: f00110
kind: feat
title: Modular adoption planner, token budget and self-host contract
status: ready
type: proposal
track: architecture
date: 2026-07-12
---

# f00110 — modular adoption planner token budget self host contract

## Goal

Redesign downstream adoption so the agent can choose replace, augment or selected capabilities; preserve existing agent/skill/MCP/proposal mechanisms; derive paths and namespace from the target; and keep discovery/planning payloads under enforced token budgets.

## Why

Dogfood real devuelve 213.088 bytes para el plan y deriva rutas/namespace que no
respetan el propio target. El consumidor necesita una decisión explícita entre
reemplazar, complementar o adoptar solo capacidades seleccionadas.

## Non-goals

- No migrar silenciosamente un proyecto consumidor.
- No eliminar mecanismos existentes sin consentimiento explícito.

## Slices

- global_gate: e2e

### S1 — Adoption strategy and contract
- **Files**: packages/core/src/lib/bootstrap/adoption-strategy.ts
- **Files**: packages/core/src/lib/bootstrap/schemas.ts
- **Files**: packages/core/tests/src/lib/bootstrap/adoption-strategy.spec.ts
- **Gate**: `bun run typecheck`
- **Status**: pending

### S2 — Bounded analyze and plan projections
- **Files**: packages/core/src/lib/bootstrap/analyze-tool.ts
- **Files**: packages/core/src/lib/bootstrap/plan-tool.ts
- **Files**: packages/core/src/lib/bootstrap/build-blueprint.ts
- **Files**: packages/core/tests/src/lib/bootstrap/plan-tool.spec.ts
- depends_on: [S1]
- **Gate**: `bun run test`
- **Status**: pending

### S3 — Target layout and self-host correctness
- **Files**: packages/core/src/lib/scaffold/scaffold-host.ts
- **Files**: packages/core/src/lib/bootstrap/recommend-plan.ts
- **Files**: packages/core/tests/src/lib/scaffold/scaffold-host.spec.ts
- depends_on: [S1]
- **Gate**: `bun run typecheck`
- **Status**: pending

### S4 — Consumer migration and coexistence e2e
- **Files**: packages/core/tests/src/lib/bootstrap/adoption-modes.e2e.spec.ts
- **Files**: docs/mcp-vertex/examples/adoption-modes/README.md
- depends_on: [S2, S3]
- **Gate**: `bun run test`
- **Status**: pending

## Acceptance

- El modo compacto queda bajo presupuesto medido y el detalle es lazy/paginado.
- Replace, augment y partial producen planes distintos sin clobber.
- El repositorio pasa su propio fixture de adopción y respeta layout/prefix.
