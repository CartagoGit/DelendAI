---
id: f00198
title: "Activation precision / recall / churn"
kind: feat
status: ready
type: proposal
track: observability
date: 2026-08-25
priority: P2
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track M / f00198"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - f00185 # plugin states (alimenta la métrica)
    - f00199 # tool confusion rate (sinergia)
    - r00033 # envelopes compartidos
    - c00134 # métricas plugin lifecycle
---

# f00198 — Activation precision / recall / churn

## Goal

Exponer tres **KPIs cross-plugin** que miden la calidad de la
activación del catálogo:

- **Activation precision**: de las tools que el LLM invocó en una
  sesión, ¿cuántas eran las que *debía* invocar?
- **Activation recall**: de las tools que *debía* invocar, ¿cuántas
  invocó?
- **Activation churn**: variabilidad entre sesiones (cuánto cambia
  el conjunto de tools activadas para la misma tarea).

### Comportamiento actual

- No hay KPIs cross-plugin.
- Solo hay contadores de invocaciones por tool.
- La auditoría externa (§48) lo marca como gap: no sabemos si el
  catálogo está sobre-activado (precision baja) o sub-activado
  (recall bajo).

### Comportamiento deseado

- `packages/core/src/lib/observability/activation-kpis.ts`:
  - `precision`: `intersect(invocadas, esperadas) / |invocadas|`.
  - `recall`: `intersect(invocadas, esperadas) / |esperadas|`.
  - `churn`: `jaccard(prev_invocadas, current_invocadas)` a lo
    largo de varias sesiones para la misma tarea.
- "Esperadas" se determina por:
  - `expectedToolsFor(taskId)`: una heurística basada en los
    plugins que típicamente intervienen (puede ser manual al
    principio).
  - O por feedback del usuario (marca "esto fue útil" / "esto fue
    ruido").
- Salida en el dashboard:
  - Sección "Activation KPIs" con promedios de las últimas N
    sesiones.
  - Tendencia.

## why

- Cierra §48 de la auditoría.
- Da una medida cuantitativa de "el catálogo está bien
  dimensionado".
- Habilita decisiones: si recall es bajo, hay tools escondidas que
  el LLM necesita; si precision es bajo, hay tools que saturan el
  contexto sin valor.
- Habilita `f00199` (tool confusion rate) como complemento.

## non-goals

- No entrena un modelo de "esperadas" automáticamente; empieza con
  heurística + feedback manual.
- No rompe el flujo actual; agrega una capa de medición.
- No envía telemetría (R1.9): los KPIs son locales.

## architecture

### 1. Módulo

- `packages/core/src/lib/observability/activation-kpis.ts`:
  - Recolecta eventos de invocación desde el router.
  - Computa precision/recall/churn.
  - Persiste en `.vscode/mcp-vertex/kpis.json` (local).
  - Expone API para el dashboard.

### 2. UI Dashboard

- `tools/scripts/report/token-budget-dashboard.script.ts` añade
  sección "Activation KPIs".

### 3. Tests

- `packages/core/tests/src/lib/observability/activation-kpis.spec.ts`:
  - Datos sintéticos (R1.4).
  - Verifica precision/recall en casos conocidos.
  - Verifica churn entre dos sesiones.

## Slices

### S1 — Módulo + dashboard + tests básicos

- **Status**: pending
- **Files**: `packages/core/src/lib/observability/activation-kpis.ts`, `tools/scripts/report/token-budget-dashboard.script.ts`, `packages/core/tests/src/lib/observability/activation-kpis.spec.ts`
- **Gate**: type

## acceptance

- Módulo computa precision/recall/churn.
- Dashboard muestra sección.
- Tests verdes con datos sintéticos.
- Sin telemetría.
- `bun run validate` verde.
