---
id: v00131
title: "Podar los `outputSchema` de quality-policy y usage-tracking (AUD-B01)"
kind: perf
status: ready
type: proposal
track: tokens
date: 2026-08-29
priority: P1
related:
    - q00011
    - v00129 # predecesor: los 5 outputSchema más baratos del core (mismo patrón)
    - v00130 # hermano independiente: orchestrator-runner
---

# v00131 — Podar los `outputSchema` de `quality-policy` y `usage-tracking` (AUD-B01)

## Goal

Cerrar el tercer y último bloque de la poda de `AUD-B01` que `v00129`
dejó fuera explícitamente: `quality_policy` (quality-policy) y
`usage_report` + `session_hygiene` (usage-tracking). El payload de
respuesta real no cambia; solo lo que se declara por adelantado en
`tools/list`.

## why

Medido con `bun tools/scripts/report/token-budget-dashboard.script.ts`
(superficie `native`, preset `vertex`), sección "Top tools by bytes":

| Tool | Owner | `outputSchema` (B) | Total tool (B) |
|---|---|---:|---:|
| `quality_policy` | quality-policy | 7.902 | 8.319 |
| `usage_report` | usage-tracking | 5.817 | 6.629 |
| `session_hygiene` | usage-tracking | 2.990 | 3.345 |
| **Total** | | **16.709** | **18.293** |

Esto coincide con la cifra que el propio `v00129` ya había anotado en
sus `non-goals` para este territorio: "`usage-tracking`
(`usage_report` + `session_hygiene`, 8.807 B)" — 5.817 + 2.990 =
8.807 B, exacto. `outputSchema` sigue siendo opcional en la
especificación MCP; el modelo no necesita el shape exacto de la
respuesta antes de llamar, lo tiene después en `structuredContent`.

## why this design

Mismo diseño que `v00129` y `v00130`, sin reabrir ninguna decisión ya
tomada en esa sesión:

- El envelope compartido `$defs`/`$ref` **no ahorra nada** en este
  stack (verificado empíricamente por `v00128`: zod v4 + el SDK de MCP
  no deduplican `$ref`). No se persigue aquí.
- Se reutiliza `compactOutputSchema()`
  (`packages/core/src/lib/surface/compact-output-schema.ts`, creada
  por `v00129`) en vez de un segundo envelope compacto redundante.
- Se comprobó si alguna de las tres tools usa su `outputSchema`
  también como validador de respuesta en runtime, el patrón que en
  `v00129` obligó a separar `ReportStatusInternalSchema`: **ninguna lo
  hace**. `quality-policy.tool.ts`, `report.tool.ts` (usage-tracking) y
  `session-hygiene.tool.ts` solo pasan su schema al `outputSchema`
  declarado del registro; no hay ningún `.parse()` / `.safeParse()`
  contra el payload de retorno en ninguno de los tres ficheros. No
  hace falta la separación interno/declarado que sí necesitó
  `report_status`.

## non-goals

- **`orchestrator-runner`.** Cubierto por `v00130`, territorio de otra
  sesión.
- **El envelope compartido `$defs`/`$ref`.** Sin beneficio medible en
  este SDK (ver "why this design").
- **Niveles de detalle (`full`/`compact`/`normal`) vía `tool_details`**
  y **esquemas como recursos MCP.** Arquitectura ideal de `AUD-B01`;
  fuera del ROI mínimo de esta ronda, igual que en `v00129`/`v00130`.
- **`plugins/usage-tracking/src/lib/tools/clear.tool.ts`** — su
  `outputSchema` no aparece en el top-20 del dashboard; podarlo no
  está justificado por tamaño en esta ronda.
- **Las cuatro métricas de "superficie útil" (`activation
  precision/recall/churn`, `useful tokens`) que `AUD-B05` propone
  añadir a `usage_report`.** Esta propuesta poda lo que ya se declara;
  no añade campos nuevos al esquema. Cubierto por `f00272`.

## architecture

Las tres tools importan `compactOutputSchema()` de
`packages/core/src/lib/surface/compact-output-schema.ts` en vez de sus
schemas Zod completos actuales:

- `quality-policy`: `QualityPolicyOutputSchema`, definido inline en
  `plugins/quality-policy/src/lib/tools/quality-policy.tool.ts`.
- `usage-tracking`: `OutputSchema` (el de `usage_report`), definido
  inline en `plugins/usage-tracking/src/lib/tools/report.tool.ts`, y el
  `outputSchema` inline de
  `plugins/usage-tracking/src/lib/tools/session-hygiene.tool.ts`.

Los handlers siguen devolviendo exactamente el mismo payload de
siempre — `toolJson(...)`/`toolOk(...)` no cambian —, así que
`structuredContent` es idéntico byte a byte antes y después de esta
propuesta. Los tres schemas Zod completos permanecen exportados/
definidos en sus ficheros de origen (los consumen los tests de
comportamiento existentes); solo dejan de usarse como `outputSchema`
declarado en el registro de la tool.

## slices

### S1 — Podar `quality_policy`, `usage_report` y `session_hygiene`

- **Status**: pending
- **Files**:
    - `plugins/quality-policy/src/lib/tools/quality-policy.tool.ts`
    - `plugins/usage-tracking/src/lib/tools/report.tool.ts`
    - `plugins/usage-tracking/src/lib/tools/session-hygiene.tool.ts`
    - `plugins/quality-policy/tests/src/lib/tools/quality-policy.tool.spec.ts`
    - `plugins/usage-tracking/tests/src/lib/tools/report.tool.spec.ts`
    - `plugins/usage-tracking/tests/src/lib/tools/session-hygiene.tool.spec.ts`
    - `docs/mcp-vertex/TOKEN-BUDGETS.md` (regenerado)
- **Gate**: `bunx vitest run --project quality-policy`,
  `bunx vitest run --project usage-tracking`, `bun run tokens:gate`,
  `bun run tokens:ceiling-ratchet`, `bun run tokens:dashboard:check`,
  `bun tools/scripts/typecheck.script.ts`

Reemplaza el `outputSchema` registrado de las tres tools por
`compactOutputSchema()`. Objetivo medido: los 16.709 B de
`outputSchema` de estas tres tools caen a ~3×139 B (~417 B), un ahorro
de ~16.290 B en `vertex`. Añade un test de regresión que fija un techo
de 200 B por `outputSchema` declarado en las tres tools.

**Importante — orden de los gates**: correr `tokens:dashboard:check`
**antes** de regenerar `TOKEN-BUDGETS.md` a mano. Ese gate compara el
documento versionado contra una medición fresca; regenerar el
documento primero lo deja siempre en verde y esconde si el gate estaba
realmente comprobando algo.

## dependency graph

S1 es la única slice. No depende de `v00129`/`v00130` en el código
—importa el mismo helper pero no lo modifica— aunque conviene
aplicarse después para que `TOKEN-BUDGETS.md` no tenga que resolver
regeneraciones concurrentes del mismo fichero. Independiente de
`v00130`.

## acceptance

- `outputSchema` de `quality_policy`, `usage_report` y
  `session_hygiene` cae de 16.709 B a ~417 B en el preset `vertex`,
  medido con `token-budget-dashboard.script.ts` (columna `OutputSchema
  Bytes`), no estimado.
- Ninguna tool pierde capacidad funcional: `structuredContent` es
  idéntico antes/después; lo cubren las suites de comportamiento
  existentes de `quality-policy` y `usage-tracking` (no tocadas) más
  el nuevo test de regresión de tamaño.
- `bunx vitest run --project quality-policy` y
  `--project usage-tracking` en verde.
- `bun run tokens:gate`, `bun run tokens:ceiling-ratchet` y
  `bun run tokens:dashboard:check` en verde, sin subir ningún techo.
- `bun tools/scripts/typecheck.script.ts` en verde.

## risks and mitigations

- **Riesgo: un host que valide `structuredContent` contra el
  `outputSchema` declarado vería un schema más laxo que antes.**
  Mitigación: idéntica a `v00129`/`v00130` — `additionalProperties:
  true` es estrictamente más permisivo, nunca más estricto.
- **Riesgo: el tipo TypeScript generado para el SDK público pierde
  precisión.** Mitigación: mismo patrón ya aceptado en `v00129` para
  tools "action-multiplexed"; no es una excepción nueva.
- **Riesgo: `usage_report` es precisamente la tool que `AUD-B05`
  propone extender con las métricas de superficie útil, y podar su
  `outputSchema` ahora podría chocar con ese trabajo futuro.**
  Mitigación: ninguna. `compactOutputSchema()` es
  `z.looseObject({ ok: z.boolean().optional() })` —
  `additionalProperties: {}`— así que cualquier campo nuevo que
  `f00272` añada al payload real sigue siendo válido contra el
  `outputSchema` declarado sin tocar esta propuesta.
- **Riesgo: alguna de las tres tools depende de su `outputSchema`
  declarado en runtime y no se detectó en la revisión de código.**
  Mitigación: cubierto por las suites de comportamiento existentes más
  el gate de tests de ambos plugins.
- **Riesgo: confundir esta propuesta con el cierre completo de
  `AUD-B01`.** Mitigación: explícito en `non-goals` — junto con
  `v00129` y `v00130` cubre la poda por tamaño; la arquitectura ideal
  queda fuera.

## notes

El `rationale` del plan `q00011` para esta propuesta cita "Podar
`quality_policy` (7.902 B) y `usage_report` (5.817 B)" — ambas cifras
coinciden exactamente con lo medido aquí. El plan no menciona
`session_hygiene` por nombre, pero `v00129` ya la había incluido
explícitamente en sus `non-goals` como parte del territorio de esta
propuesta ("`usage-tracking` (`usage_report` + `session_hygiene`,
8.807 B)"), y 5.817 + 2.990 = 8.807 B cuadra de forma exacta con lo
medido en esta sesión. Se incluye aquí para no dejar un cabo suelto
que el propio `v00129` ya había prometido cerrar.

Ficheros de referencia:

- `packages/core/src/lib/surface/compact-output-schema.ts`
- `docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md` (AUD-B01)
- `docs/mcp-vertex/proposals/ready/perfs/v00129-prune-the-five-cheapest-fix-core-outputschemas.md`
