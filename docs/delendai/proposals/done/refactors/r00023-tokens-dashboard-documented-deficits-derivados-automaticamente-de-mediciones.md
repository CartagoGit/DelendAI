---
id: r00023
title: "\"tokens-dashboard-documented-deficits-derivados-automaticamente-de-mediciones\""
kind: refactor
status: done
type: proposal
track: tokens
date: 2026-08-25
parent-plan: q00005
---

# r00023 — déficits documentados derivados de la medición gobernante

## Goal

Hacer que la sección `Documented deficits` se derive automáticamente de las mediciones que gobiernan CI, en vez de declarar `none` cuando existen breaches reales en la superficie nativa.

## why

La tercera auditoría detectó la contradicción más grave del dashboard: la tabla ocultaba el breach real de `swarm` y a la vez afirmaba `Documented deficits: none`. Eso invalida el documento como artefacto de gobernanza.

## non-goals

- No auto-bumpea budgets.
- No convierte todas las advertencias en déficits: solo refleja breaches reales contra la medición que comparte semántica con `tokens:gate`.

## Slices

- global_gate: none

### S1 — Derivar déficits desde la fila gobernante
- **Status**: done
- **Files**: `tools/scripts/report/token-budget-dashboard.script.ts`, `docs/mcp-vertex/TOKEN-BUDGETS.md`
- **Gate**: none

## acceptance

- Si la fila `native / tokens-gate` de un preset breacha su hard budget, `Documented deficits` lo enumera automáticamente.
- Si no hay breaches en la medición gobernante, la sección puede seguir mostrando `- none`.
- El dashboard regenerado y su check quedan sincronizados tras el cambio.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the implementation pre-exists the q00005 migration and is verifiable via `git log --grep=r00023` against the merged work
- closure-gate: requireAllChildrenDone satisfied for plan q00005
