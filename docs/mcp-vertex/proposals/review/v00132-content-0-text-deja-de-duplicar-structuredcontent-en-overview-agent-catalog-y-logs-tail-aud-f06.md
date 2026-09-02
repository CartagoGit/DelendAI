---
id: v00132
title: "content[0].text deja de duplicar structuredContent en overview, agent_catalog y logs_tail (AUD-F06)"
kind: perf
status: in-progress
type: proposal
track: tokens
date: 2026-08-29
priority: P2
related:
    - q00011
    - v00129 # mismo track de tokens, mismo tipo de poda "declarar menos, no cambiar el dato real"
last-transition-id: 3449f996-e2ba-499b-9aa9-e1edf1ba2796
last-correlation-id: 3449f996-e2ba-499b-9aa9-e1edf1ba2796
last-transition-from: ready
---

# v00132 — `content[0].text` deja de duplicar `structuredContent` (AUD-F06)

## Goal

Para un subconjunto acotado de tools —las de mayor payload que no se
consumen internamente vía `content[0].text`—, dejar de emitir el
mismo JSON completo dos veces por respuesta. `structuredContent` sigue
llevando el dato completo; `content[0].text` pasa a llevar un resumen
compacto en vez de una copia byte a byte de lo mismo.

## why

`packages/core/src/lib/shared/tool-response.ts` serializa el mismo
valor dos veces en `toolJson`/`toolOk`/`toolError`:
`content[0].text = JSON.stringify(value)` y `structuredContent =
value`. Medido con `bun tools/scripts/report/token-budget-dashboard.script.ts`
(sección "Fixture-gated surfaces", que mide bytes reales de
`content[0].text` en una llamada real), las tres tools de mayor coste
que resultan seguras de tocar (ver "why this design"):

| Tool | `content[0].text` (B) | Duplicado en `structuredContent` |
|---|---:|---|
| `overview` (full) | 11.727 | Sí, mismo objeto |
| `agent_catalog` (full) | 8.736 | Sí, mismo objeto |
| `logs_tail` | 2.609¹ | Sí, mismo objeto |

¹ `logs_tail` es contenido dinámico (cola real de logs del proceso de
test); el número varía entre regeneraciones del dashboard —se ha visto
1.080–2.609 B en esta misma sesión, según `v00129`— pero la
duplicación relativa (2×) es constante independientemente del tamaño
real.

Un cliente que lea `structuredContent` (lo hace
`packages/client/src/lib/transport/mcp-stdio-client.ts`, función
`request()`: usa `result.structuredContent` cuando está presente y
solo cae a `content[0].text` si no lo está) nunca necesita el texto
completo. Para esos clientes, el segundo JSON es puro coste de wire
sin beneficio.

## why this design

**No se toca `toolJson`/`toolOk`/`toolError` en `tool-response.ts`.**
La auditoría original (`AUD-F06`) propone la solución mínima como si
fuera segura de aplicar globalmente al helper compartido. No lo es:
investigando el blast radius real antes de escribir esta propuesta se
encontraron **ocho sitios de llamada internos, en proceso, dentro de
`plugins/proposals`**, que leen `content[0]?.text` como su **única**
fuente del payload —nunca `structuredContent`— porque invocan
handlers de otras tools directamente en memoria (no vía transporte
MCP):

- `auto-work.tool.ts:234,547` (lee la respuesta de `continue_proposal`)
- `state-tools.tool.ts:288` (lee el estado de un lock)
- `orchestration.tool.ts:219,303` (`plan`/`delegate` leen resultados de
  asignación y de lock)
- `agent-lock-engine.ts:322,366` (motor de locks)
- `continue-proposal.tool.ts:459` (lee el payload de un lock)
- `authoring.tool.ts:868` (`close_slice`)
- `agent-lock.tool.ts:207`

Si `content[0].text` dejara de llevar el JSON completo para
`continue_proposal`, `agent_lock`, `plan`, `delegate`, `state_health`/
`state_repair` o `close_slice`, estos ocho sitios recibirían un resumen
en vez del dato que necesitan y romperían en producción, no solo en
tests. Además existe una invariante de test ya documentada y explícita
—`plugins/proposals/tests/src/lib/e2e/assembled-proposals-server.ts:38-44`—
que afirma literalmente: *"Every proposals tool that declares an
`outputSchema` must satisfy the invariant `structuredContent ===
parsed(content[0].text)`"*. Tocar el helper compartido rompería esa
invariante documentada para las 51 tools que la usan, no solo para
`plugins/proposals`.

Por eso el diseño es **quirúrgico, no global**: una función nueva y
aditiva, usada solo donde ya se verificó que no hay consumidor interno
de `content[0].text`.

## non-goals

- **`toolJson`, `toolOk`, `toolError`, `toolErrorWithLogHint` en
  `tool-response.ts`.** No cambian de comportamiento. Sus 51 tools
  consumidoras siguen recibiendo el duplicado exacto que tienen hoy;
  romper esa garantía es justamente el riesgo que este documento
  evita.
- **Cualquier tool de `plugins/proposals`.** Ver "why this design":
  ocho sitios internos dependen de `content[0].text` como fuente única
  del payload completo. Ninguna tool de este plugin entra en el
  alcance de esta propuesta, aunque alguna aparezca en el top de bytes
  del dashboard.
- **Medir `wire_bytes` / `model_context_tokens` / `useful_tokens` por
  host**, como propone la "arquitectura ideal" de `AUD-F06`. Requiere
  perfil de cliente en `initialize` (`AUD-C01`/`x00285`, ya en la
  rama) pero clasificar el comportamiento de cada host frente a
  `content` vs `structuredContent` es trabajo de observabilidad nuevo,
  no una poda. Fuera de esta ronda.
- **Cualquier otra tool no auditada explícitamente en `S1`.** Aplicar
  el mismo patrón a más tools requiere repetir la comprobación de "¿la
  lee algo en proceso vía `content[0].text`?" tool por tool; no se
  extrapola en bloque solo porque una tool aparezca en el dashboard.

## architecture

Nueva función aditiva en `packages/core/src/lib/shared/tool-response.ts`,
junto a `toolJson` (no la reemplaza):

```ts
export const toolJsonWithSummary = (
	value: Record<string, unknown>,
	summaryText: string,
): IToolTextResult => ({
	content: [{ type: 'text', text: summaryText }],
	structuredContent: value,
});
```

`overview`, `agent_catalog` y `logs_tail` la importan en vez de
`toolJson`/`toolOk`, y cada una construye su propio `summaryText` corto
y legible por humanos a partir de los mismos datos que ya calcula
—no un dato nuevo, un subconjunto formateado de lo que ya se
devuelve—: por ejemplo, `overview` puede resumir a
`"<N> plugins, <M> tools active"`, `agent_catalog` a `"<N> agents, <M> skills"`,
`logs_tail` a `"<N> log lines, newest at <ts>"`. `structuredContent`
sigue llevando el objeto completo, byte a byte igual que antes de esta
propuesta.

Un cliente que ignore `structuredContent` y solo lea texto (el caso
que la propia auditoría reconoce que existe, "con matiz honesto")
recibe menos información que antes para estas tres tools concretas;
es el trade-off explícito de esta propuesta, documentado en riesgos.

## slices

### S1 — `content[0].text` compacto en `overview`, `agent_catalog`, `logs_tail`

- **Status**: done
- **Files**:
    - `packages/core/src/lib/shared/tool-response.ts` (nueva función
      `toolJsonWithSummary`)
    - `packages/core/tests/src/lib/shared/tool-response.spec.ts`
    - `packages/core/src/lib/tools/overview-tool.ts`
    - `packages/core/src/lib/tools/agent-catalog-tool.ts`
    - `plugins/logs/src/lib/tools/tools.ts` (registro de `tail`)
    - `plugins/logs/tests/tools.spec.ts`
    - `docs/mcp-vertex/TOKEN-BUDGETS.md` (regenerado)
- **Gate**: `bunx vitest run --project core`,
  `bunx vitest run --project logs`, `bun run tokens:gate`,
  `bun run tokens:ceiling-ratchet`, `bun run tokens:dashboard:check`,
  `bun tools/scripts/typecheck.script.ts`

Sustituye `toolJson(payload)`/`toolOk(payload)` por
`toolJsonWithSummary(payload, summaryText)` en las tres tools.
`structuredContent` no cambia; el test de regresión nuevo comprueba
que `content[0].text !== JSON.stringify(structuredContent)` para las
tres (la aserción inversa a la invariante de `plugins/proposals`,
deliberadamente, porque aquí el contrato es el opuesto) y que
`JSON.parse` de `content[0].text` sigue siendo JSON válido (una
cadena de texto simple también lo es, pero se explicita para dejar
constancia del contrato).

**Importante — orden de los gates**: correr `tokens:dashboard:check`
**antes** de regenerar `TOKEN-BUDGETS.md` a mano, igual que en
`v00129`/`v00130`/`v00131` — regenerar primero deja el gate en verde
sin haber comprobado nada.

## dependency graph

S1 es la única slice. Independiente de `v00129`/`v00130`/`v00131`
(toca `content[0].text`, no `outputSchema`) y de `x00296` (ese
arregla qué superficie se mide, no qué se emite). Puede aplicarse en
cualquier orden respecto a ellas.

## acceptance

- `content[0].text` de `overview` (full), `agent_catalog` (full) y
  `logs_tail` deja de ser un duplicado byte a byte de
  `structuredContent`: pasa a ser un resumen de una línea, medido con
  `token-budget-dashboard.script.ts` (columna de bytes de la sección
  "Fixture-gated surfaces" debe bajar significativamente para estas
  tres filas, no estimado).
- `structuredContent` de las tres tools es idéntico byte a byte al de
  antes de esta propuesta — ningún consumidor que ya lea
  `structuredContent` (incluido `packages/client`) ve ningún cambio.
- Ningún sitio de llamada interno de `plugins/proposals` se toca ni se
  ve afectado: las ocho llamadas identificadas en "why this design"
  no invocan `overview`, `agent_catalog` ni `logs_tail`, y sus propias
  tools (`continue_proposal`, `agent_lock`, `plan`, `delegate`,
  `state_health`, `state_repair`, `close_slice`) no cambian.
- La invariante `structuredContent === parsed(content[0].text)` de
  `plugins/proposals/tests/src/lib/e2e/assembled-proposals-server.ts`
  sigue verde sin modificarse, porque ninguna tool de ese plugin se
  toca.
- `bunx vitest run --project core` y `--project logs` en verde.
- `bun run tokens:gate`, `bun run tokens:ceiling-ratchet` y
  `bun run tokens:dashboard:check` en verde, sin subir ningún techo.
- `bun tools/scripts/typecheck.script.ts` en verde.

## risks and mitigations

- **Riesgo principal, explícito en el propio hallazgo: un cliente que
  solo lea `content[0].text` (nunca `structuredContent`) pierde
  información real para estas tres tools.** Mitigación: acotado a
  tres tools de orientación/observabilidad donde el resumen sigue
  siendo accionable (cuántos plugins, cuántos agentes, cuántas líneas
  de log) y donde el dato completo sigue disponible en
  `structuredContent` para cualquier cliente moderno. No se aplica a
  ninguna tool cuyo *único* propósito sea que el modelo lea el dato
  completo del texto (por ejemplo, no se aplica a `search_search` ni
  `docs_docs_list`, que devuelven resultados que sí hace falta leer
  íntegros).
- **Riesgo: un caller interno no detectado en la revisión de código
  depende de `content[0].text` de una de estas tres tools.**
  Mitigación: búsqueda explícita (`grep` de `mcp-vertex_overview`,
  `mcp-vertex_agent_catalog`, `mcp-vertex_logs_tail` combinado con
  `content[0]`) no encontró ningún sitio en `packages/` o `plugins/`
  que las invoque en proceso — los tres únicos hits eran menciones en
  comentarios/docstrings, no llamadas reales. Documentado en el propio
  cuerpo de la propuesta para que el implementador repita la
  comprobación si el código se mueve antes de implementar.
- **Riesgo: generalizar el patrón a más tools sin repetir esta
  comprobación.** Mitigación: explícito en `non-goals` — cada
  extensión futura de este patrón necesita su propio análisis de
  llamadores internos, no se hereda de esta propuesta.
- **Riesgo: confundir esto con la solución completa de `AUD-F06`.**
  Mitigación: explícito en `non-goals` — la arquitectura ideal
  (`wire_bytes`/`model_context_tokens`/`useful_tokens` por host)
  queda fuera; esta propuesta es la poda mínima seguridad-primero para
  tres tools concretas.

## notes

Esta propuesta nace de una discrepancia entre lo que pedía la sesión
que la originó (mapear `v00132` a `AUD-B05`) y lo que dice realmente
el plan `q00011`: su `rationale` para `v00132` es *"Dejar de
serializar el mismo JSON en `content[0].text` y `structuredContent`.
AUD-F06."* — no `AUD-B05` (que es una propuesta de métricas de
activación, cubierta por `f00272`, sin relación con duplicación de
payload). Este documento sigue al plan y a `AUD-F06`, que es el
hallazgo cuyo contenido coincide con el título real de `v00132`.

El propio `AUD-F06` es honesto sobre el matiz: la duplicación es real
y medible en el wire, pero su efecto en la factura de tokens del
modelo depende de qué mitad del resultado consuma cada host. Esta
propuesta no resuelve esa incertidumbre —eso es la arquitectura
ideal, fuera de alcance—; solo deja de pagar el duplicado donde ya se
verificó, código en mano, que nadie en este repositorio depende de
que `content[0].text` lleve el JSON completo.

**Verificación 2026-09-02 (cierre):** al revisar el repo antes de
implementar, `overview` (`overview-tool.ts`) y `agent_catalog`
(`agent-catalog-tool.ts`) **ya** usaban `toolJsonWithSummary` — podadas
en una sesión previa no vinculada explícitamente a este id.
`logs_tail` (`plugins/logs/src/lib/tools/tools.ts:328`, registro
`tail`) seguía usando `toolJson(...)`, duplicando el payload completo
en `content[0].text`. Se podó en esta sesión: import de
`toolJsonWithSummary`, `summaryText` = `"<N> log lines, newest at
<ts>"`. Se añadió un test de regresión en
`plugins/logs/tests/tools.spec.ts` ("v00132 (AUD-F06): content[0].text
is a compact summary, not a duplicate of structuredContent") que
verifica `content[0].text !== JSON.stringify(structuredContent)` y que
`JSON.parse(content[0].text)` sigue siendo válido. Medido con
`token-budget-dashboard.script.ts`: sección "Fixture-gated surfaces"
en `docs/mcp-vertex/TOKEN-BUDGETS.md` — `overview full` 47 B,
`agent_catalog full` 33 B, `logs_tail` 28 B (antes: 11.727 B / 8.736 B
/ 2.609 B según el hallazgo original). `bunx vitest run --project core`
(270/270) y `--project logs` (9/9, 87 tests) en verde;
`tokens:gate`, `tokens:ceiling-ratchet` y `tokens:dashboard:check` en
verde sin subir ningún techo; `typecheck.script.ts` limpio. No se tocó
ninguna tool de `plugins/proposals`; su invariante
`structuredContent === parsed(content[0].text)` no se vio afectada.

Ficheros de referencia:

- `packages/core/src/lib/shared/tool-response.ts`
- `plugins/proposals/tests/src/lib/e2e/assembled-proposals-server.ts`
- `docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md` (AUD-F06)
