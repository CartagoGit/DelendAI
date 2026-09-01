---
id: f00270
title: "`TokenBudgetRegistry` unificado"
kind: feat
status: blocked
type: proposal
track: tokens
date: 2026-08-25
priority: P1
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track E / f00270"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - c00005 # token gate CI real (sinergia)
    - c00136 # Token ROI por plugin (consume el registry)
    - r00031 # compactación de output (el registry la reporta)
    - r00032 # idem orchestrator-runner
---

# f00270 — `TokenBudgetRegistry` unificado

## Goal

Una sola API consumida por todos los puntos del repo que necesitan
medir, validar y reportar consumo de tokens: CI, dashboard, docs,
tests, CLI. Hoy §21 de la auditoría detecta que cada consumidor
reimplementa su propia medición, con fuentes divergentes.

### Comportamiento actual

- `tools/scripts/report/token-budget-dashboard.script.ts` mide
  `staticBytes` de un modo.
- `tools/scripts/ci/tokens-preset-gate.script.ts` (o equivalente)
  mide de otro modo.
- Tests usan heurísticas inline.
- CLI (`packages/cli`) tiene su propia tabla.
- Ninguno de ellos se habla entre sí → dashboards mezclan bytes de
  adaptive con tokens estimados de native.

### Comportamiento deseado

- API única en `packages/core/src/lib/budgets/registry.ts`:
  ```ts
  export class TokenBudgetRegistry {
      constructor(options: { sources: BudgetSource[] });

      measure(surface: TokenSurface): TokenMeasurement;
      validate(surface: TokenSurface): void; // throws on hard breach
      report(surface: TokenSurface): TokenReport;
  }
  ```
- `sources` son adapters (uno por fuente: schema static bytes,
  runtime telemetry, estimación nativa, etc.).
- `validate` falla con `TokenBudgetBreachError` tipado si la
  superficie excede un hard cap.
- `report` devuelve JSON estructurado y Markdown listo para el
  dashboard.

## why

- §21 de la auditoría: ausencia de un registry central produce
  métricas divergentes.
- Es la base para `c00136` (Token ROI por plugin) y para
  alinear `c00005` (token gate CI) con los dashboards.
- Elimina la deuda de "cada script mide a su manera".
- Habilita tests property-based sobre el registry (no sobre cada
  script).
- Compatibilidad: durante migración, los scripts existentes
  consumen el registry vía wrappers (no se rompen).

## non-goals

- No introduce una nueva fuente de telemetría externa (R1.9).
- No persiste el registry en una DB.
- No reemplaza a `c00005` (eso es la integración CI del registry,
  no el registry mismo).
- No introduce presupuestos; solo centraliza la medición.

## architecture

### 1. Registry

- `packages/core/src/lib/budgets/registry.ts`:
  - `TokenBudgetRegistry` (clase).
  - `BudgetSource` interface (`id`, `measure(surface): Promise<number>`).
  - `TokenSurface` enum: `'schema' | 'runtime' | 'native' | 'compact' | 'normal' | 'full'`.
  - `TokenMeasurement`/`TokenReport`: tipos puros (en
    `@mcp-vertex/contracts` si Track C avanza).

### 2. Adapters iniciales

- `packages/core/src/lib/budgets/sources/static-bytes.ts`:
  - Mide `outputSchema` de un tool.
- `packages/core/src/lib/budgets/sources/dashboard-mock.ts`:
  - Devuelve la medición que ya hace el dashboard actual
    (para no romper durante migración).

### 3. Migración gradual

- `tools/scripts/report/token-budget-dashboard.script.ts` →
  consume `TokenBudgetRegistry`.
- `tools/scripts/ci/tokens-preset-gate.script.ts` →
  consume `TokenBudgetRegistry`.
- `packages/cli/**` → consume `TokenBudgetRegistry` (vía wrapper
  mientras se actualiza el CLI).
- Cada consumidor antiguo gana un test que verifica el contrato
  con el registry.

### 4. Tests

- `packages/core/tests/src/lib/budgets/registry.spec.ts`:
  - Dos sources reportan mediciones distintas; el registry las
    combina correctamente.
  - `validate` throws con reason code estable.
  - `report` produce Markdown determinístico.

## Slices

### S1 — Registry + adapters iniciales + migración de 2 consumidores

- **Status**: pending
- **Files**: `packages/core/src/lib/budgets/registry.ts`, `packages/core/src/lib/budgets/sources/static-bytes.ts`, `packages/core/src/lib/budgets/sources/dashboard-mock.ts`, `packages/core/tests/src/lib/budgets/registry.spec.ts`, `tools/scripts/report/token-budget-dashboard.script.ts`, `tools/scripts/ci/tokens-preset-gate.script.ts`
- **Gate**: type

## acceptance

- `TokenBudgetRegistry` exporta la API del goal.
- Dos consumidores existentes (`tokens-dashboard`,
  `tokens-preset-gate`) migran al registry.
- Tests verdes del registry y de los consumidores migrados.
- Wrappers disponibles para consumidores no migrados.
- `bun run validate` verde.
