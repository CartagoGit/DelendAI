---
id: v00129
title: "Podar los 5 outputSchema más baratos de arreglar del core (AUD-B01)"
kind: perf
status: done
type: proposal
track: tokens
date: 2026-08-28
priority: P1
related:
    - v00128 # hermano de la misma sesión — advise_routing/invoke (orchestrator-runner)
    - v00130 # sucesor: advise_routing + invoke (orchestrator-runner) — no tocado aquí
    - v00131 # sucesor: quality_policy + usage_report — no tocado aquí
---

# v00129 — Podar los 5 `outputSchema` más baratos de arreglar del core

## Goal

Reducir el coste de `tools/list` podando el `outputSchema` declarado de
las cinco tools más caras que un solo agente puede arreglar sin invadir
territorio de otro (excluye `orchestrator-runner`, `quality-policy` y
`usage-tracking`, que ya tienen sus propias propuestas — `v00130`,
`v00131`). El payload de respuesta real **no cambia**; solo lo que se
declara por adelantado en `tools/list`.

## why

Medido con `bun tools/scripts/report/token-budget-dashboard.script.ts`
antes de tocar nada (superficie `native`, preset `vertex`, cliente
`tokens-gate`):

| Tool | Owner | `outputSchema` (B) | Total tool (B) |
|---|---|---:|---:|
| `plan_mcp_project` | core | 5.184 | 6.486 |
| `overview` | core | 4.168 | 4.571 |
| `analyze_project` | core | 4.163 | 5.165 |
| `report_status` | error-reporting | 3.909 | 4.237 |
| `agent_catalog` | core | 3.548 | 3.995 |
| **Total** | | **20.972** | **24.454** |

`outputSchema` es **opcional** en la especificación MCP. El modelo casi
nunca necesita el shape exacto de la respuesta antes de llamar — lo
necesita después, y para entonces ya lo tiene en `structuredContent`.
Cuatro de estas cinco tools (`overview`, `agent_catalog`,
`analyze_project`, `plan_mcp_project`) están además en el **bootstrap
del core**, así que este coste se paga siempre, en cada preset, se use
o no la tool.

## why this design

`v00128` (mismo día, mismo plugin auditado) ya verificó empíricamente
que **zod v4 + el SDK de MCP no deduplican `$defs`/`$ref`**: declarar un
único envelope compartido y referenciarlo desde varias tools serializa
el objeto entero en cada sitio igualmente — el SDK nunca activa la
opción `reused: 'ref'` de zod v4. Por tanto la "solución arquitectónica
ideal" del hallazgo AUD-B01 (un `IToolEnvelope` en `$defs` con `$ref`
repetido 187 veces) no ahorraría nada en este stack tal como está hoy;
sería trabajo puro sin beneficio medible.

Lo que sí funciona, y es lo que hace esta propuesta: declarar
`outputSchema: z.looseObject({ ok: z.boolean().optional() })` — un
objeto minúsculo con `additionalProperties: {}` (el equivalente de
`true` en la serialización de zod v4) — en vez del shape completo. Es
la misma idea de "envelope compacto" del hallazgo, aplicada por tool en
vez de por referencia compartida, porque es la única forma que de
verdad reduce bytes en este SDK.

Una tool (`report_status`) usaba su `outputSchema` también para
**validar en runtime** su propia respuesta (`.parse()` antes de
devolver). Ahí la poda separa dos cosas que estaban fusionadas: el
schema declarado en el cable (ahora compacto) y el schema de validación
interna (renombrado `ReportStatusInternalSchema`, se mantiene completo
y sigue corriendo en cada llamada). El comportamiento no cambia; solo
qué se anuncia por adelantado.

## non-goals

- **`orchestrator-runner`** (`advise_routing`, `invoke`, `advise_spend`)
  — 22.550 B de `outputSchema` en `vertex`. Cubierto por `v00128`/`v00130`,
  fuera del territorio de esta sesión.
- **`quality-policy`** (`quality_policy`, 7.902 B) y **`usage-tracking`**
  (`usage_report` + `session_hygiene`, 8.807 B). Cubiertos por `v00131`.
- **El envelope compartido `$defs`/`$ref`.** Demostrado sin beneficio en
  este SDK (ver "why this design"); no se persigue aquí ni en
  `v00130`/`v00131` salvo que el SDK cambie de comportamiento.
- **Niveles de detalle (`full`/`compact`/`normal`) publicados vía
  `tool_details`.** El hallazgo AUD-B01 los propone como parte de la
  arquitectura ideal; esta propuesta se limita a la poda de tamaño, que
  es "correcta y suficiente para empezar" según el propio hallazgo.
- **Esquemas como recursos MCP** (`mcp-vertex://schemas/<tool>`). Mismo
  motivo: arquitectura ideal, no el ROI mínimo de esta ronda.
- **`create_project`** — su coste está en `inputSchema` (3.073 B, el
  `blueprint` parcial que acepta como entrada), no en `outputSchema`
  (395 B). Fuera de alcance: AUD-B01 es sobre `outputSchema`.

## architecture

Un único factory compartido, `compactOutputSchema()`
(`packages/core/src/lib/surface/compact-output-schema.ts`), que las
cinco tools importan en vez de construir su propio shape anidado:

```ts
export const compactOutputSchema = () =>
	z.looseObject({ ok: z.boolean().optional() });
```

Serializa a JSON Schema como
`{"type":"object","properties":{"ok":{"type":"boolean"}},"additionalProperties":{}}`
(~139 B), frente a los 3.500–5.200 B por tool medidos arriba. El
`{ ok, ...data }` es el envelope canónico ya documentado en
`tool-response.ts`; declararlo no es una fantasía nueva, es lo que la
tool ya devuelve.

Cada handler sigue devolviendo exactamente el mismo payload de siempre
— `toolJson(...)`/`toolOk(...)` no cambian — así que
`structuredContent` es idéntico byte a byte al de antes de esta
propuesta. Solo cambia lo que el `outputSchema` declarado promete sobre
esa forma.

## Slices

### S1 — Podar los 5 `outputSchema`

- **Status**: done
- **Files**:
    - `packages/core/src/lib/surface/compact-output-schema.ts` (nuevo)
    - `packages/core/src/public/index.ts` (exporta `compactOutputSchema`)
    - `packages/core/src/lib/tools/overview-tool.ts`
    - `packages/core/src/lib/tools/agent-catalog-tool.ts`
    - `packages/core/src/lib/bootstrap/analyze-tool.ts`
    - `packages/core/src/lib/bootstrap/plan-tool.ts`
    - `plugins/error-reporting/src/lib/tools/report-status.tool.ts`
    - `packages/core/src/generated/tool-outputs.ts` (regenerado)
    - `packages/core/tests/src/lib/surface/compact-output-schema.spec.ts` (nuevo)
    - `plugins/error-reporting/tests/report-status.tool.spec.ts`
    - `docs/mcp-vertex/TOKEN-BUDGETS.md` (regenerado)
- **Gate**: `bunx vitest run --project core`, `bunx vitest run --project error-reporting`,
  `bun run tokens:gate`, `bun run tokens:ceiling-ratchet`,
  `bun run tokens:dashboard:check`, `bun tools/scripts/typecheck.script.ts`

Reemplaza el `outputSchema` de las cinco tools por
`compactOutputSchema()`; en `report_status` separa el schema de
validación interna (`ReportStatusInternalSchema`) del schema declarado
en el cable. Regenera `tool-outputs.ts` (los tipos SDK generados caen a
`[key: string]: unknown` — mismo patrón ya usado por otras tools
"action-multiplexed" del repo). Añade el test de regresión que fija un
techo de 200 B por `outputSchema` declarado en las cinco tools, para
que ninguna pueda volver a crecer en silencio.

## dependency graph

S1 es la única slice; no depende de nada de esta sesión. `v00130` y
`v00131` son independientes entre sí y de esta propuesta — atacan
plugins distintos y ninguno comparte código con `compact-output-schema.ts`
salvo que decidan importarlo también (recomendado, no obligatorio).

## acceptance

- `vertex` baja de 281.138 B a 260.836 B en `tools/list` (−20.302 B,
  −7,2 % del preset) — medido, no estimado.
- Ninguna tool pierde capacidad funcional: la respuesta real
  (`structuredContent`) es idéntica antes/después; lo cubren las
  suites de comportamiento existentes de cada tool (no tocadas) más el
  nuevo test de regresión de tamaño.
- `bunx vitest run --project core` y `--project error-reporting` en
  verde (232 y 19 ficheros respectivamente en el momento de escribir
  esto).
- `bun run tokens:gate`, `bun run tokens:ceiling-ratchet` y
  `bun run tokens:dashboard:check` en verde, sin subir ningún techo.
- `bun tools/scripts/typecheck.script.ts` en verde.

## risks and mitigations

- **Riesgo: un host que valide `structuredContent` contra el
  `outputSchema` declarado empezaría a ver un schema distinto (más
  laxo) del que veía antes.** Mitigación: `additionalProperties: true`
  es estrictamente más permisivo que antes, nunca más estricto — ningún
  payload real que pasara validación antes deja de pasarla ahora. Un
  host que exigiera el shape exacto (no solo "algo compatible") sí
  vería un cambio; documentado como cambio menor, coherente con el
  criterio de compatibilidad del hallazgo AUD-B01.
- **Riesgo: el tipo TypeScript generado (`tool-outputs.ts`) se vuelve
  menos preciso** (`Record<string, unknown>` en vez del shape
  detallado) para quien consuma el SDK público. Mitigación: es el mismo
  patrón ya usado por otras tools "action-multiplexed" del repo — no es
  una excepción nueva, es la convención existente aplicada aquí.
- **Riesgo: `report_status` deja de validar su propia salida.**
  Mitigación: no ocurre — `ReportStatusInternalSchema` sigue siendo el
  schema completo y el `.parse()` interno no cambió de línea; solo se
  renombró y se dejó de usar como `outputSchema` declarado. Cubierto
  por el nuevo test de regresión más las 8 specs de comportamiento
  existentes del plugin, verdes sin tocar.
- **Riesgo: confundir "esto arregla AUD-B01"** con la solución completa.
  Mitigación: explícito en `non-goals` — esto es la mitad de ROI
  mínimo que pide la tarea, no la arquitectura ideal ni el resto del
  hallazgo (`v00130`, `v00131`).

## notes

Aclaración de medición pedida por la sesión que originó esta propuesta:
el hallazgo AUD-B01 cita "los top 5 esquemas valen ~40 KB en `vertex`"
y "`advise_routing` sola vale 12,2 KB". Medido en esta sesión,
`advise_routing` es **8.804 B totales / 7.969 B de `outputSchema`**, no
12,2 KB — la cifra del hallazgo no se pudo reproducir tal cual (posible
medición contra un commit distinto, o contra el objeto de cable
completo incluyendo `execution`, que `v00128` S5 documenta que
`measureSchemaBytes()` omite hoy). Los "top 5 ~40 KB" sí cuadran, pero
solo si se cuentan `invoke` + `advise_routing` + `quality_policy` +
`usage_report` + `plan_mcp_project` (10.149 + 8.804 + 8.319 + 6.629 +
6.486 = 40.387 B) — es decir, mezclando tools de `v00130` y `v00131`
con una de esta propuesta. Los cinco `outputSchema` que sí caen dentro
del territorio de esta sesión (excluyendo `orchestrator-runner`,
`quality-policy`, `usage-tracking`) suman 20.972 B, no 40 KB.

Una fila del dashboard cambió por un motivo ajeno a esta propuesta:
`logs_tail` (tabla "bounded payloads") pasó de 2.594 B a 1.080 B entre
la primera y la segunda regeneración de `TOKEN-BUDGETS.md` en esta
sesión, sin que este trabajo tocara `plugins/logs`. Es contenido
dinámico (cola de logs real del proceso de test) — no una regresión de
medición ni un efecto de esta poda.

Ficheros de referencia:

- `packages/core/src/lib/surface/compact-output-schema.ts`
- `docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md` (AUD-B01)
- `docs/mcp-vertex/proposals/ready/perfs/v00128-shrink-the-two-most-expensive-output-schemas.md`
