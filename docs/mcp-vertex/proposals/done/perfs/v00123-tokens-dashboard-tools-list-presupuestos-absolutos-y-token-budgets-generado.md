---
id: v00123
title: "tokens: dashboard tools/list, presupuestos absolutos y TOKEN-BUDGETS generado"
kind: perf
status: done
type: proposal
track: tokens
date: 2026-08-24
---

# v00123 — tokens: dashboard tools/list, presupuestos absolutos y TOKEN-BUDGETS generado

## Goal

Tratar `tools/list` como coste de primer orden: dashboard por preset/plugin, presupuestos absolutos y `TOKEN-BUDGETS.md` generado desde la misma fuente que el test.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §9 TOK-001 — dashboard `tools/list` (preset, tool count, schema bytes, description bytes, inputSchema/outputSchema bytes, marginal bytes por plugin)
- §9 TOK-002 — presupuestos absolutos + relativos (hard ceiling, warning ceiling, release ceiling, marginal plugin ceiling)
- §9 TOK-003 — no subir budgets automáticamente (justificar/compensar/documentar)
- §9 TOK-004 — generar `TOKEN-BUDGETS.md` (docs y tests han divergido)
- §20 DOC-002 — generar TOKEN-BUDGETS (misma fuente)
- §28 CHECK-007 — medir con tokenizer real de modelos frecuentes

El test actual (`token-budget.e2e.spec.ts`) y `docs/mcp-vertex/TOKEN-BUDGETS.md` están desincronizados. Un solo generador produce ambos, y el gate pasa a ser un ceiling absoluto además del relativo.

## why

La superficie estática (hasta ~190 KB en swarm) es el mayor coste de contexto del proyecto, y el presupuesto se ha ido subiendo para acomodar features. Un dashboard generado + ceilings absolutos convierten el budget en una restricción real, no en un registro histórico de crecimiento.

## non-goals

- No subir ningún presupuesto en esta propuesta.
- No sustituir el gate longitudinal +20% (se complementa con ceilings absolutos).
- No reescribir las descripciones de tools aquí (propuesta de superficie dinámica).

## Slices

- global_gate: type

### S1 — Generador de dashboard y TOKEN-BUDGETS
- **Status**: done
- **Files**: `docs/mcp-vertex/TOKEN-BUDGETS.md`
- **Gate**: type
- acceptance:
  - "Genera el report por preset/plugin (tool count, schema/description/inputSchema/outputSchema bytes, marginal por plugin)."
  - "Escribe docs/mcp-vertex/TOKEN-BUDGETS.md desde la misma fuente que el test."
  - "El script generador nuevo se crea en tools/scripts/report/token-budget-dashboard.script.ts."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — Presupuestos absolutos en el test e2e
- **Status**: done
- **Files**: `packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts`
- **Gate**: type
- acceptance:
  - "El test usa la misma fuente que el generador (sin números duplicados)."
  - "Se añaden hard ceiling, warning ceiling y marginal plugin ceiling."
  - "Una feature que rompe un budget justifica/compensa/documenta (TOK-003)."
  - "CHECK-007: mide el coste real por preset con un tokenizer de modelo frecuente (script nuevo tools/scripts/report/tokenizer-real.script.ts) y publica los números en el dashboard."

## acceptance

- Genera el report por preset/plugin (tool count, schema/description/inputSchema/outputSchema bytes, marginal por plugin).
- Escribe docs/mcp-vertex/TOKEN-BUDGETS.md desde la misma fuente que el test.
- El test usa la misma fuente que el generador (sin números duplicados).
- Se añaden hard ceiling, warning ceiling y marginal plugin ceiling.
- Una feature que rompe un budget justifica/compensa/documenta (TOK-003).
- CHECK-007: mide el coste real por preset con un tokenizer de modelo frecuente y publica los números en el dashboard.
