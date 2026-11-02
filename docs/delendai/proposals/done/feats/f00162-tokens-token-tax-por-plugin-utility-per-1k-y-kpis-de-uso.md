---
id: f00162
title: "tokens: token tax por plugin, utility per 1K y KPIs de uso"
kind: feat
status: done
type: proposal
track: tokens
date: 2026-08-24
shipped-in:
  - 6c2af6c7 # feat(usage-tracking): f00162 — token tax por plugin, utility per 1K y KPIs
---

# f00162 — tokens: token tax por plugin, utility per 1K y KPIs de uso

## Goal

Añadir **token tax por plugin** y la métrica **utility per 1K tokens**, junto con los KPIs que faltan.

Parte del plan `q00003`. Referencias legadas (`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`):

- §9 TOK-005 — token tax por plugin (`staticSchemaBytes`, `compactTypicalBytes`, `p95ResponseBytes`)
- §9 TOK-011 — utility per 1K tokens (task success contribution / context cost)
- §29 KPI-001..012 — cold-start cost, schema bytes por plugin, invocation rate, success contribution, P50/P95 response bytes, P50/P95 latency, tool error rate, plugin activation rate, dynamic activation savings, memory compaction savings, context rehydration effectiveness, privacy gate blocked-report count
- §28 CHECK-008 — qué features de plugins casi nunca se usan y pagan token tax siempre

Los KPIs se agregan localmente (sin queries ni datos privados). La utility per 1K permite decidir económicamente qué plugins cargar de inicio.

## why

Hoy el auto-selector piensa solo en adecuación funcional. Con el tax y la utility por 1K, la selección de plugins pasa a ser una decisión económica basada en datos, y el presupuesto de tokens deja de ser un ceiling técnico arbitrario.

## non-goals

- No persistir queries/args/outputs (solo agregados locales).
- No conectar aún con el optimizador adaptativo (propuesta separada).
- No penalizar la activación dinámica (se mide su ahorro, no se asume).

## Slices

- global_gate: type

### S1 — Token tax por plugin
- **Status**: done
- **Files**: `plugins/usage-tracking/src/lib/token-tax.helper.ts`
- **Gate**: type
- acceptance:
  - "Cada plugin declara/deriva staticSchemaBytes, compactTypicalBytes, p95ResponseBytes."
- review-state: done
- review-implementer: swarm-implementer
- review-reviewer: orchestrator-fase1-review
- review-log: approved by orchestrator-fase1-review — Fase 1 review 2026-08-25: validate verde.
### S2 — KPIs locales en report y rollup
- **Status**: done
- **Files**: `plugins/usage-tracking/src/lib/tools/report.tool.ts`, `plugins/usage-tracking/src/lib/rollup.ts`
- **Gate**: type
- acceptance:
  - "Report incluye KPI-001..012 como agregados locales sin datos privados."
  - "Se calcula utility per 1K por plugin (success contribution / context tokens)."

### S3 — Tests de tax y utility
- **Status**: done
- **Files**: `plugins/usage-tracking/tests/token-tax.spec.ts`
- **Gate**: type
- acceptance:
  - "El tax y la utility son deterministas y no filtran paths/args."

## acceptance

- Cada plugin declara/deriva staticSchemaBytes, compactTypicalBytes, p95ResponseBytes.
- Report incluye KPI-001..012 como agregados locales sin datos privados.
- Se calcula utility per 1K por plugin (success contribution / context tokens).
- El tax y la utility son deterministas y no filtran paths/args.
