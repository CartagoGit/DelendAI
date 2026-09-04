---
id: c00135
title: "Separar dashboards adaptive vs native"
kind: chore
status: done
type: proposal
track: tokens
date: 2026-08-25
priority: P1
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
shipped-in:
    - f5836e9 # S1 modelo por superficie + generador + tests + dashboard entry
    section: "Track E / c00135"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - f00186 # TokenBudgetRegistry unificado (provee los datos)
    - c00136 # Token ROI por plugin (consume las columnas separadas)
    - r00031 # compactación proposal_get (alimenta el dashboard native)
---

# c00135 — Separar dashboards adaptive vs native

## Goal

Que el dashboard de tokens **no mezcle** bytes de adaptive
(`outputSchema` JSON serializado) con tokens estimados de native
(prompt completo renderizado). Hoy §21/§20 de la auditoría detecta
que la sección "Documented deficits" reporta breaches que son
artefacto de la mezcla, no reales.

### Comportamiento actual

- `tools/scripts/report/token-budget-dashboard.script.ts` (o
  equivalente) produce una tabla única `Tool | budget | used |
  status` donde `used` es a veces `staticBytes` (adaptive) y a
  veces estimación de prompt (native).
- "Documented deficits" suma ambas sin distinción → breaches
  falsos positivos o negativos.
- Consumidores del dashboard (`c00136`, `f00198`) heredan la
  confusión.

### Comportamiento deseado

- Dos columnas separadas en el dashboard:
  - `Adaptive used (bytes)`: serialización JSON del `outputSchema`
    con datos sintéticos.
  - `Native used (tokens)`: estimación de prompt (input + output)
    con datos sintéticos.
- Sección "Documented deficits" lista los **breaches reales**:
  - Adaptive breach: `used > budget`.
  - Native breach: `used > budget`.
- Las dos métricas se calculan independientemente vía
  `TokenBudgetRegistry` (`f00186`).

## why

- §21/§20: la mezcla impide saber qué se está midiendo.
- Sin separación, `c00136` (Token ROI) calcula sobre una base
  contaminada.
- Habilita que el `TokenBudgetRegistry` reporte por superficie
  (`'schema' | 'native'`), lo cual es la base para futuras
  alertas (Track M).
- Compatibilidad aditiva: el dashboard sigue exponiendo totales,
  pero **además** expone las dos columnas separadas.

## non-goals

- No redefine los presupuestos (eso es scope de governance
  futura).
- No introduce una nueva fuente de telemetría nativa (R1.9).
- No reemplaza al dashboard; lo extiende.
- No migra los datos históricos (solo aplica a partir de este
  punto).

## architecture

### 1. Modelo

- `packages/core/src/lib/budgets/types.ts` (extensión):
  ```ts
  export type Surface = 'adaptive' | 'native';
  export interface PerSurfaceMeasurement {
      adaptive?: number; // bytes
      native?: number;   // tokens (estimación)
  }
  ```

### 2. Dashboard

- `apps/web/src/data/token-budget.json` (o equivalente, generado):
  ```json
  {
      "tools": [
          {
              "id": "proposals.get",
              "budget": { "adaptive": 4096, "native": 12000 },
              "used":   { "adaptive": 800,  "native": 2100 },
              "status": { "adaptive": "ok", "native": "ok" }
          }
      ],
      "documentedDeficits": [
          { "tool": "...", "surface": "native", "ratio": 1.4 }
      ]
  }
  ```

### 3. Generador

- `tools/scripts/report/token-budget-dashboard.script.ts`
  (extensión):
  - Recibe ambos `sources` (adaptive y native) del
    `TokenBudgetRegistry`.
  - Renderiza las dos columnas.
  - "Documented deficits" se calcula con la métrica del surface
    correspondiente, no sobre un total mezclado.

### 4. Tests

- `tools/scripts/report/token-budget-dashboard.spec.ts`:
  - Herramientas con datos solo adaptive: el dashboard muestra la
    columna adaptive y deja `native` como `null` (no como 0).
  - Herramientas con datos solo native: idem.
  - Breaches falsos desaparecen al separar.

## Slices

### S1 — Modelo + generador extendido + tests + dashboard entry

- **Status**: done
- **Files**: `packages/core/src/lib/budgets/types.ts`, `tools/scripts/report/token-budget-dashboard.script.ts`, `tools/scripts/report/token-budget-dashboard.spec.ts`, `apps/web/src/data/token-budget.json`
- **Gate**: type
- review-state: done
- review-implementer: sparrow
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificado: token-budget-dashboard.spec 5/5 verde (separación adaptive/native, null no 0, deficits por surface), typecheck core/tools limpio, token-budget.json generado. Contrato del slice cumplido.
## acceptance

- Dashboard expone dos columnas (`adaptive`, `native`) por tool.
- "Documented deficits" lista breaches reales por surface.
- Tests verdes con los 3 escenarios del plan.
- `bun run validate` verde.
