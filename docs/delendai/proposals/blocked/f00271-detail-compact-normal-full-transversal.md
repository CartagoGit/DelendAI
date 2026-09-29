---
id: f00271
title: "`detail: compact | normal | full` transversal"
kind: feat
status: blocked
type: proposal
track: tokens
date: 2026-08-25
priority: P1
parent-plan: q00006
audit-source:
    file: docs/delendai/audits/legacy/2026-08-25-develop-external-audit-chatgpt-sol-cuarta-pasada.md
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
  - Sin runtime dependencies (importable desde `@delendai/contracts`
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

- **Status**: done
- **Files**: `packages/core/src/lib/contracts/detail.contract.ts`, `packages/core/tests/src/lib/contracts/detail.contract.spec.ts`, `plugins/audit/src/lib/tools/audit-run.tool.ts`, `plugins/audit/src/lib/tools/audit-run.schemas.ts`, `plugins/audit/src/lib/tools/audit-consolidate.tool.ts`, `plugins/usage-tracking/src/lib/tools/report.tool.ts`, `plugins/logs/src/lib/tools/tools.ts`, `plugins/logs/tests/tools.spec.ts`
- **Gate**: type
- review-state: changes_requested
- review-implementer: GitHub
- review-reviewer: delivery_verifier
- review-log: requested_changes by delivery_verifier — Regresión de compatibilidad en logs: query, subscribe, correlate y search resuelven detail omitido a normal, y normal vacía metadata. Sin detail debe conservarse el comportamiento legado con metadata completa; aplicar la proyección nueva solo cuando detail se solicite explícitamente. Mantén includeMeta compatible.
- **Evidence (2026-09-15)**: the logs regression the review raised is fixed in PR #223 (merge `7127cc34a`): an omitted `detail` resolves through `includeMeta` first and otherwise keeps each tool's legacy default — redacted `full` for query, subscribe, correlate and search, `normal` for tail and errors_tail — so metadata is no longer emptied unless `detail` is requested. `plugins/logs/tests/tools.spec.ts` pins both defaults. The shared contract lives in `detail.contract.ts` (not `detail.ts`; spec 6/6); audit adopts it in `audit-run` (specs 9/9 and 6/6) and `audit-consolidate` (8/8, compact trims consensus, findings and markdown); usage adopts it in the `usage-tracking` plugin's `report.tool.ts` (there is no `plugins/usage`), tools spec 9/9. The Files list above names what actually shipped.
### S2 — Adopción en project-health, dependencies, search + lint

- **Status**: done
- **Files**: `plugins/project-health/src/lib/tools/project-health.tool.ts`, `plugins/project-health/tests/src/project-health.tool.spec.ts`, `plugins/deps/src/lib/tools/tools.ts`, `plugins/deps/tests/src/lib/deps.spec.ts`, `plugins/search/src/lib/tools/search.tool.ts`, `plugins/search/tests/src/lib/tools/search.tool.spec.ts`, `tools/scripts/lint/detail-levels-coverage.script.ts`, `tools/scripts/lint/detail-levels-coverage.script.spec.ts`, `package.json`
- **Gate**: type
- review-state: in_review
- review-implementer: copilot-f00271-s2
- review-log: requested_changes by delivery_verifier — Corregir tres puntos: 1) detail-levels-coverage debe evaluar cada tool registrado, no solo el archivo, para no marcar adopciones parciales como completas; 2) cablear el lint advisory en la batería de scripts/validate dentro del alcance permitido o dejar evidencia explícita de por qué requiere una hija separada; 3) añadir tests focalizados para compact/normal/full y schema/runtime en project-health, deps y search, preservando payload legado cuando detail se omite.
- **Evidence (2026-09-15)**, point by point against the review:
  1. The lint already judged each `server.registerTool` block (per-block `detail` input and `projectDetail` projection, with the file-wide `DETAIL_LEVELS`/`DetailSchema` markers). It now takes the repo root as a parameter, and `detail-levels-coverage.script.spec.ts` pins that behaviour on fixtures: a file with one adopted and one legacy registration reports one adopted and one pending tool, with only the two per-tool reasons. On the real tree it first reported 13 adopted and 265 pending across 278 registrations, and that count was too low. It only recognised core's `DETAIL_LEVELS` constant, so tools that kept their own `z.enum(['compact', 'normal', 'full'])` or took `detail` from a sibling contract counted as pending. Since 2026-09-15 it also accepts a literal detail enum (local or inline), follows an input schema imported from a sibling module one import deep, and counts a handler that reads `detail` as a projection. The same tree then reports 18 adopted and 260 pending, with nothing lost and five registrations gained: `audit_run`, `advise_routing`, `advise_spend`, `invoke` and `proposal_get`. The spec covers each form, plus a tool whose imported schema has no `detail` field and still reports all three gaps.
  2. It is wired as `lint:detail-levels-coverage:advisory` inside `validate:run`, next to `verify:plugin-wiring:advisory`, and chained at the end of `lint:architecture`, so CI's `lint-architecture` job prints it too (`lint:lints-reach-ci` requires every lint script to reach a workflow). It always exits 0: the rollout is gradual, and a blocking gate would fail on the 260 pending tools. `lint:no-silent-gates` and `lint:referenced-scripts-exist` pass with it in the chain.
  3. Focused specs cover `project_health` (summary and domain), `deps_list`, `deps_polyglot` and `search`. They check that an omitted `detail` returns the legacy payload with no `detail` key; that `normal` and `full` equal the legacy payload plus `detail` (search `normal` drops the before/after context); that `compact` trims routing metadata, dependency rows, providers and hits; that every payload parses against the tool's `outputSchema`; and that an unknown level is rejected. The dependencies plugin is `plugins/deps`; there is no `plugins/dependencies`.
- **Still open for the parent (checked 2026-09-15 on `develop`)**:
  - **Acceptance 1 is met.** All 8 target plugins accept `detail`. `audit`, `usage-tracking`, `logs`, `project-health`, `deps` and `search` use core's contract. `proposals` (`proposal_get`, through `proposalReadInputSchema`) and `orchestrator-runner` (`advise_routing`, `advise_spend`, `invoke`) use their own `compact|normal|full` enum with core's `projectDetail`, or project by reading `detail`.
  - **Acceptance 2 cannot be satisfied as written.** `staticBytes` is the size of a plugin's registered tool list (`JSON.stringify` of `tools/list` in `token-budget-report-lib.ts`), and `detail` does not change it. What varies by level is the bytes of a real call's answer. The dashboard library can already measure that (`measureToolText` over a connected client). A per-level, per-tool table therefore needs those response bytes, measured against a fixture workspace so the numbers are reproducible.
  - **Measured table (2026-09-15, `develop` at `6dba830fa`).**
    - *Method.* Response bytes (UTF-8 length of the answer's text) were measured on the native surface. The client listed tools before calling, as hosts do. The run used `token-budget-report-lib.ts`'s harness (`createTokenBudgetFixtureWorkspace`, `connectTokenBudgetClient`, one `callTool` per level) with a `package.json` added to the fixture, and all 8 target plugins loaded.

    | tool | omitted | compact | normal | full |
    |---|---|---|---|---|
    | `deps_list` | 263 | 163 | 281 | 279 |
    | `deps_polyglot` | 16 | 35 | 34 | 32 |
    | `search` (`query: "proposal"`) | 777 | 128 | 795 | 793 |
    | `project_health` | 477 | 108 | 495 | 493 |
    | `logs_query` | 19,907 | 4,765 | 9,427 | 31,283 |
    | `logs_tail` | 50 | 50 | 50 | 50 |
    | `logs_errors_tail` | 63 | 64 | 63 | 61 |
    | `logs_subscribe` | 35,422 | 9,016 | 12,553 | 33,903 |
    | `logs_search` (`pattern: "tool"`) | 42,527 | 11,881 | 17,480 | 48,898 |
    | `usage_report` | 7,429 | 1,369 | 7,429 | 7,427 |
    | `audit_plan` | 10,480 | 619 | 10,480 | 10,478 |
    | `advise_routing` (one task) | 411 | 411 | 444 | 510 |
    | `advise_spend` | 319 | 211 | 319 | 415 |

    - *Variance.* The log tools read events the same run appends, so their sizes vary between runs. An earlier run gave `logs_query` 12,210 bytes omitted.
    - *Empty payloads.* A tool with nothing to list pays only for the added `detail` key under each level, which is why `deps_polyglot` (no polyglot manifests in the fixture) and the empty log tails do not shrink.
    - *No per-level answers.* `logs_correlate` (no task id) and `audit_consolidate` (no audit directory) returned their error envelope, 147 B and 232 B at every level. Before #232 a listing client could not receive those at all.
    - *Not measured.* `audit_run`, `invoke` and `proposal_get` need arguments (targets, a provider task, a view) that the fixture does not provide.
  - **Consequence.** The table answers the intent of acceptance 2, but it is not yet reproducible from the repository: the probe that produced it is not a committed script. Three adopted tools are unmeasured, and the log rows depend on run state. Until a committed measurement exists, with fixed log fixtures and arguments for the three missing tools, the proposal stays out of `done/`.
## acceptance

- 8 plugins objetivo aceptan `detail` (incluyendo `proposals` y
  `orchestrator-runner` ya migrados).
- Tabla antes/después de `staticBytes` por nivel, por tool.
- Lint (si se implementa en S2) reporta los plugins rezagados.
- `bun run validate` verde.
