---
id: v00130
title: "Podar los `outputSchema` de orchestrator-runner: invoke, advise_routing y advise_spend (AUD-B01)"
kind: perf
status: done
type: proposal
track: tokens
date: 2026-08-29
priority: P1
related:
    - q00011
    - v00128 # hermano de la misma sesión — advise_routing/invoke (orchestrator-runner)
    - v00129 # predecesor: los 5 outputSchema más baratos del core (mismo patrón)
    - v00131 # sucesor independiente: quality_policy + usage_report/session_hygiene
---

# v00130 — Podar los `outputSchema` de `orchestrator-runner` (AUD-B01)

## Goal

Continuar la poda de `AUD-B01` en el territorio que `v00129` dejó
explícitamente fuera: las tres tools de `orchestrator-runner` con
`outputSchema` más caro — `invoke`, `advise_routing` y `advise_spend`.
El payload de respuesta real no cambia; solo lo que se declara por
adelantado en `tools/list`.

## why

Medido con `bun tools/scripts/report/token-budget-dashboard.script.ts`
(superficie `native`, preset `vertex`), sección "Top tools by bytes":

| Tool | `outputSchema` (B) | Total tool (B) |
|---|---:|---:|
| `invoke` | 9.085 | 10.149 |
| `advise_routing` | 7.969 | 8.804 |
| `advise_spend` | 5.515 | 5.950 |
| **Total** | **22.569** | **24.903** |

`outputSchema` sigue siendo opcional en la especificación MCP y el
modelo no necesita el shape exacto de la respuesta antes de llamar
—lo tiene después, en `structuredContent`—, igual que ya justificó
`v00129`.

## why this design

Mismo diseño que `v00129`, sin reabrir ninguna decisión de esa sesión:

- El envelope compartido `$defs`/`$ref` **no ahorra nada** en este
  stack — `v00128` verificó empíricamente que zod v4 y el SDK de MCP
  no deduplican `$ref`. No se persigue aquí.
- Se reutiliza el mismo factory ya construido en `v00129`,
  `compactOutputSchema()`
  (`packages/core/src/lib/surface/compact-output-schema.ts`), en vez
  de crear un segundo envelope compacto redundante.
- Se comprobó si alguna de las tres tools usa su `outputSchema`
  también como validador de respuesta en runtime (el patrón que obligó
  a separar `ReportStatusInternalSchema` en `v00129`): **ninguna lo
  hace**. `invoke.tool.ts`, `advise-routing.tool.ts` y
  `advise-spend.tool.ts` solo pasan `InvokeOutputSchema` /
  `AdviseRoutingOutputSchema` / `AdviseSpendOutputSchema` al
  `outputSchema` declarado del registro; no hay ningún `.parse()` /
  `.safeParse()` de esos schemas contra el payload de retorno en
  ninguno de los tres ficheros (el único `JSON.parse` en
  `advise-spend.tool.ts:235` es de un documento de entrada ajeno, no
  una validación del propio output). No hace falta la separación
  interno/declarado que sí necesitó `report_status`.

## non-goals

- **`quality-policy` y `usage-tracking`.** Cubiertos por `v00131`,
  territorio de otra sesión.
- **El envelope compartido `$defs`/`$ref`.** Sin beneficio medible en
  este SDK (ver "why this design").
- **Niveles de detalle (`full`/`compact`/`normal`) vía `tool_details`**
  y **esquemas como recursos MCP.** Arquitectura ideal de `AUD-B01`;
  fuera del ROI mínimo de esta ronda, igual que en `v00129`.
- **`bootstrap`, `format-handoff`, `set-provider-state`,
  `list-models`, `cancel-invocation`, `get-quota`,
  `healthcheck-providers`** (resto de tools de `orchestrator-runner`
  con `outputSchema` propio) — ninguna aparece en el top-20 del
  dashboard; podarlas no está justificado por tamaño.

## architecture

Las tres tools importan `compactOutputSchema()` de
`packages/core/src/lib/surface/compact-output-schema.ts` (ya existe,
creada por `v00129`) en vez de sus schemas Zod completos
(`InvokeOutputSchema`, `AdviseRoutingOutputSchema`,
`AdviseSpendOutputSchema`, definidos en
`plugins/orchestrator-runner/src/lib/schemas.ts`). Los handlers siguen
devolviendo exactamente el mismo payload de siempre —
`toolJson(...)`/`toolOk(...)` no cambian—, así que `structuredContent`
es idéntico byte a byte antes y después de esta propuesta. Los tres
schemas Zod completos permanecen exportados desde `schemas.ts` (los
consumen los tests de comportamiento existentes y potencialmente otros
llamadores internos); solo dejan de usarse como `outputSchema`
declarado en el registro de la tool.

## slices

### S1 — Podar `invoke`, `advise_routing` y `advise_spend`

- **Status**: done
- **Files**:
    - `plugins/orchestrator-runner/src/lib/tools/invoke.tool.ts`
    - `plugins/orchestrator-runner/src/lib/tools/advise-routing.tool.ts`
    - `plugins/orchestrator-runner/src/lib/tools/advise-spend.tool.ts`
    - `plugins/orchestrator-runner/tests/src/lib/tools/invoke.tool.spec.ts`
    - `plugins/orchestrator-runner/tests/src/lib/tools/advise-routing.tool.spec.ts`
    - `plugins/orchestrator-runner/tests/src/lib/tools/advise-spend.tool.spec.ts`
    - `docs/mcp-vertex/TOKEN-BUDGETS.md` (regenerado)
- **Gate**: `bunx vitest run --project orchestrator-runner`,
  `bun run tokens:gate`, `bun run tokens:ceiling-ratchet`,
  `bun run tokens:dashboard:check`, `bun tools/scripts/typecheck.script.ts`

Reemplaza el `outputSchema` registrado de las tres tools por
`compactOutputSchema()`. Objetivo medido: los 22.569 B de
`outputSchema` de estas tres tools caen a ~3×139 B (~417 B), un ahorro
de ~22.150 B en `vertex`. Añade (o extiende, si `v00129` dejó un
patrón reutilizable) un test de regresión que fija un techo de 200 B
por `outputSchema` declarado en las tres tools, para que ninguna pueda
volver a crecer en silencio.

**Importante — orden de los gates**: correr `tokens:dashboard:check`
**antes** de regenerar `TOKEN-BUDGETS.md` a mano. Ese gate compara el
documento versionado contra una medición fresca; regenerar el
documento primero lo deja siempre en verde y esconde si el gate estaba
realmente comprobando algo.

## dependency graph

S1 es la única slice. No depende de `v00129` en el código —importa el
mismo helper pero no lo modifica— aunque conviene aplicarse después
para que `TOKEN-BUDGETS.md` no tenga que resolver dos regeneraciones
concurrentes del mismo fichero. Independiente de `v00131`.

## acceptance

- `outputSchema` de `invoke`, `advise_routing` y `advise_spend` cae de
  22.569 B a ~417 B en el preset `vertex`, medido con
  `token-budget-dashboard.script.ts` (columna `OutputSchema Bytes`),
  no estimado.
- Ninguna tool pierde capacidad funcional: `structuredContent` es
  idéntico antes/después; lo cubren las suites de comportamiento
  existentes de `orchestrator-runner` (no tocadas) más el nuevo test
  de regresión de tamaño.
- `bunx vitest run --project orchestrator-runner` en verde.
- `bun run tokens:gate`, `bun run tokens:ceiling-ratchet` y
  `bun run tokens:dashboard:check` en verde, sin subir ningún techo.
- `bun tools/scripts/typecheck.script.ts` en verde.

## risks and mitigations

- **Riesgo: un host que valide `structuredContent` contra el
  `outputSchema` declarado vería un schema más laxo que antes.**
  Mitigación: idéntica a `v00129` — `additionalProperties: true` es
  estrictamente más permisivo, nunca más estricto; ningún payload real
  que pasara antes deja de pasar ahora.
- **Riesgo: el tipo TypeScript generado para el SDK público pierde
  precisión** (`Record<string, unknown>` en vez del shape detallado).
  Mitigación: mismo patrón ya aceptado en `v00129` para tools
  "action-multiplexed"; no es una excepción nueva.
- **Riesgo: alguna de las tres tools sí depende de su `outputSchema`
  declarado en runtime y no se detectó en la revisión de código.**
  Mitigación: cubierto por las suites de comportamiento existentes
  (no tocadas) más el gate de tests del plugin; si algo dependiera de
  la forma exacta, fallaría ahí antes del merge.
- **Riesgo: confundir esta propuesta con el cierre completo de
  `AUD-B01`.** Mitigación: explícito en `non-goals` — junto con
  `v00129` y `v00131` cubre la poda por tamaño; la arquitectura ideal
  (niveles de detalle, recursos MCP) queda fuera, igual que en los dos
  hermanos.

## notes

Discrepancia frente al propio plan `q00011`: su `rationale` para esta
propuesta cita "`advise_routing` (12.157 B de `outputSchema`) e
`invoke` (9.127 B)". Medido en esta sesión con el dashboard real,
`advise_routing` es **7.969 B** (no 12.157) e `invoke` es **9.085 B**
(cerca de 9.127, diferencia de 42 B probablemente por un commit
intermedio). El propio `v00129` ya había corregido la cifra de
`advise_routing` en su nota final (8.804 B totales / 7.969 B de
`outputSchema`) citando exactamente esta discrepancia con el hallazgo
original — este documento la hereda y la confirma, no la reintroduce.
También se incluye `advise_spend` (5.515 B), que ni el `rationale` del
plan ni el hallazgo `AUD-B01` mencionan por nombre pero que `v00129`
ya había contabilizado explícitamente en sus `non-goals` como parte
del territorio de esta propuesta ("22.550 B de `outputSchema` total en
`vertex`" para las tres tools de `orchestrator-runner`; el 22.569 B
medido aquí coincide dentro de margen de redondeo).

Ficheros de referencia:

- `packages/core/src/lib/surface/compact-output-schema.ts`
- `docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md` (AUD-B01)
- `docs/mcp-vertex/proposals/ready/perfs/v00129-prune-the-five-cheapest-fix-core-outputschemas.md`
