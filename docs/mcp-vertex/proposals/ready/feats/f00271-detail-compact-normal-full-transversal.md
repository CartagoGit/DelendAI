---
id: f00271
title: "`detail: compact | normal | full` transversal"
kind: feat
status: ready
type: proposal
track: tokens
date: 2026-08-25
priority: P1
parent-plan: q00006
audit-source:
    file: docs/mcp-vertex/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
    section: "Track E / f00271"
    sha256: 2374da0f620dc2cfab21e0d435e143f10174731864efce9f26f2d3a00104232a
related:
    - q00006
    - r00031 # proposal_get (canary del patrón)
    - r00032 # orchestrator-runner (canary)
    - f00270 # TokenBudgetRegistry (mide los 3 niveles)
---

# f00271 — `detail: compact | normal | full` transversal

## Goal

Promover el patrón `detail: 'compact' | 'normal' | 'full'` que
`r00031` y `r00032` aplican a `proposal_get` y `orchestrator-runner`
a **todos los plugins** relevantes: `proposals`, `orchestrator`,
`audit`, `usage`, `logs`, `project-health`, `dependencies`,
`search`. Tras esta hija, un agente puede predecir el coste de
cualquier tool a partir de un solo campo de input.

### Comportamiento actual

- Solo `proposal_get` y `orchestrator-runner.get` aceptan `detail`.
- El resto de plugins devuelve shape fija, sin manera de pedir
  menos.
- Consumidores que iteran sobre muchos items (`audit_list`,
  `dependency_list`, `search`) pagan el coste completo de cada
  item.

### Comportamiento deseado

- Módulo compartido `packages/core/src/lib/contracts/detail.ts`:
  ```ts
  export const DETAIL_LEVELS = ['compact', 'normal', 'full'] as const;
  export type Detail = (typeof DETAIL_LEVELS)[number];

  export interface WithDetail {
      detail?: Detail; // default 'normal'
  }

  export function projectDetail<T>(
      full: T,
      levels: Record<Detail, (full: T) => unknown>,
      requested?: Detail,
  ): unknown;
  ```
- Cada tool afectado:
  - Acepta `detail?: Detail` en su `inputSchema`.
  - Implementa las 3 funciones de proyección (`compact`,
    `normal`, `full`).
  - Documenta el tamaño esperado por nivel en su JSDoc.
- Plugins objetivo (en este orden de adopción):
  1. `proposals` (get, list) — ya cubierto por `r00031`.
  2. `orchestrator-runner` (get, list) — ya cubierto por `r00032`.
  3. `audit` (plan, consolidate, list).
  4. `usage` (get).
  5. `logs` (get, list).
  6. `project-health` (get).
  7. `dependencies` (list, get).
  8. `search` (query).

## why

- §15 de la auditoría: el patrón de detalle es puntual, no
  transversal.
- Sin transversalidad, cada plugin reinventa el shape, y los
  agentes no pueden predecir coste.
- Habilita que el `TokenBudgetRegistry` (`f00270`) reporte
  presupuestos por nivel, no solo totales.
- Compatibilidad aditiva: tools sin `detail` explícito
  mantienen su comportamiento actual.

## non-goals

- No redefine qué campos van en cada nivel (eso lo decide cada
  tool, basándose en `r00031`/`r00032` como guía).
- No introduce paginación.
- No fusiona tools.
- No fuerza a todos los plugins a soportar los 3 niveles
  simultáneamente (la rollout es gradual; los que aún no migran
  mantienen su shape actual).

## architecture

### 1. Contrato compartido

- `packages/core/src/lib/contracts/detail.ts`:
  - `Detail`, `DETAIL_LEVELS`, `WithDetail`, `projectDetail`.
  - Sin runtime dependencies (importable desde `@mcp-vertex/contracts`
    si Track C avanza).

### 2. Adopción por plugin

- Cada plugin:
  - Importa `WithDetail` y lo extiende en su `inputSchema`.
  - Implementa `projectCompact|projectNormal|projectFull`.
  - Mide tamaños antes/después con `TokenBudgetRegistry`
    (`f00270`).
  - Añade tests por nivel.

### 3. Lint arquitectónico (opcional, scope de esta hija)

- `tools/scripts/lint/detail-levels-coverage.script.ts`:
  - Lista tools que NO aceptan `detail`.
  - Warning (no error) si un plugin tiene ≥ 1 tool con output
    > 20 KB sin soporte de `detail`.

### 4. Tests

- `packages/core/tests/src/lib/contracts/detail.spec.ts`:
  - `projectDetail` retorna la forma correcta por nivel.
  - Default `'normal'` cuando `requested` ausente.
  - Levels no listados en el levels map lanzan error tipado.
- Por cada tool migrado: tests análogos a los de `r00031`.

## Slices

### S1 — Contrato compartido + adopción en audit, usage, logs (3 plugins)

- **Status**: pending
- **Files**: `packages/core/src/lib/contracts/detail.ts`, `packages/core/tests/src/lib/contracts/detail.spec.ts`, `plugins/audit/src/lib/tools/*.ts`, `plugins/usage/src/lib/tools/get.ts`, `plugins/logs/src/lib/tools/get.ts`, `plugins/logs/src/lib/tools/list.ts`
- **Gate**: type

### S2 — Adopción en project-health, dependencies, search + lint

- **Status**: pending
- **Files**: `plugins/project-health/src/lib/tools/get.ts`, `plugins/dependencies/src/lib/tools/list.ts`, `plugins/dependencies/src/lib/tools/get.ts`, `plugins/search/src/lib/tools/query.ts`, `tools/scripts/lint/detail-levels-coverage.script.ts`
- **Gate**: type

## acceptance

- 8 plugins objetivo aceptan `detail` (incluyendo `proposals` y
  `orchestrator-runner` ya migrados).
- Tabla antes/después de `staticBytes` por nivel, por tool.
- Lint (si se implementa en S2) reporta los plugins rezagados.
- `bun run validate` verde.
