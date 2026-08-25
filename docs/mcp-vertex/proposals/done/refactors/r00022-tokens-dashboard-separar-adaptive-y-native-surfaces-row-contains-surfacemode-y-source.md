---
id: r00022
title: "\"tokens-dashboard-separar-adaptive-y-native-surfaces-row-contains-surfacemode-y-source\""
kind: refactor
status: done
type: proposal
track: tokens
date: 2026-08-25
parent-plan: q00005
---

# r00022 — dashboard separado por `surfaceMode` y `source`

## Goal

Separar en el dashboard las mediciones `native` y `adaptive`, dejando explícitos `surfaceMode` y `source` en cada fila para que nunca vuelvan a mezclarse superficies de coste radicalmente distinto.

## why

Antes de este cambio, el dashboard renderizaba una sola fila por preset a partir de una medición adaptativa, y la presentaba como si describiera el preset completo. Eso convertía una diferencia de semántica en una falsa sensación de cumplimiento presupuestario.

## non-goals

- No cambia los budgets declarados.
- No modifica el contrato del preset ni el routing de superficie en el runtime.

## Slices

- global_gate: none

### S1 — Duplicar la medición por superficie y etiquetar su origen
- **Status**: done
- **Files**: `tools/scripts/report/token-budget-dashboard.script.ts`, `docs/mcp-vertex/TOKEN-BUDGETS.md`
- **Gate**: none

## acceptance

- Cada preset aparece con filas separadas para `native / tokens-gate` y `adaptive / dynamic-client`.
- Las tablas del dashboard incluyen columnas `Surface Mode` y `Source`.
- El resumen de tokens y el dashboard plugin marginal usan la misma separación, sin mezclar ambas superficies.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the implementation pre-exists the q00005 migration and is verifiable via `git log --grep=r00022` against the merged work
- closure-gate: requireAllChildrenDone satisfied for plan q00005
