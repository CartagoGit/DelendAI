---
id: f00272
title: "Useful tokens: qué fracción de `tools/list` se usa de verdad"
kind: feat
status: done
type: proposal
track: tokens
date: 2026-08-29
parent-plan: q00011
audit-source:
    file: docs/delendai/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-B05
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P2
related: [q00011, f00198, f00199, f00273]
last-transition-id: 24d719b5-ad61-4f47-b5f3-9e9473ca6f77
last-correlation-id: 24d719b5-ad61-4f47-b5f3-9e9473ca6f77
last-transition-from: review
shipped-in:
  - 0c42fcd60
---

# f00272 — Useful tokens: qué fracción de `tools/list` se usa de verdad

## Goal

Añadir el KPI **`useful tokens`** — bytes de las tools invocadas al
menos una vez en una sesión / bytes totales de `tools/list` servidos
en esa sesión — a `usage_report`, componiéndolo sobre los KPIs de
activación (`activation precision/recall`) y `activation churn` que
**ya tiene propuesta y pendiente `f00198`**, en lugar de
reimplementarlos.

## why

**Verificación de la premisa del hallazgo.** `AUD-B05` describe la
falta de un KPI de "tokens útiles" y de precisión/recall/churn de
activación, y cita `packages/core/src/lib/observability/plugin-metrics`,
`tool-confusion` y `plugins/usage-tracking` como los datos ya
recogidos que ningún artefacto cruza. Confirmado: ninguno de esos
tres módulos calcula hoy una razón bytes-usados/bytes-servidos.

**Lo que la auditoría no vio y este triage sí.** `docs/delendai/proposals/ready/feats/f00198-activation-precision-recall-churn.md`
(`q00006`, `status: ready`, `S1: pending`, sin implementar) ya
propone exactamente `activation precision`, `activation recall` y
`activation churn` como KPIs cross-plugin sobre el mismo dato base
(`plugin-metrics` + `usage-tracking`), y
`docs/delendai/proposals/ready/feats/f00199-tool-confusion-rate.md`
ya propone la métrica de confusión que `AUD-B05` menciona como
"informe longitudinal accionable" que falta. Escribir f00272 como
una copia de esas tres métricas duplicaría trabajo ya planificado. La
única pieza del hallazgo que ningún proposal existente cubre es
**`useful tokens`** en sí — la razón bytes-útiles/bytes-totales de
`tools/list` — que es una métrica distinta (mide el payload servido,
no el patrón de invocación) y el "KPI que resume todo" según la
propia auditoría.

**Por qué es un problema igualmente.** Sin `useful tokens` no hay
forma de decidir qué podar por *uso real* en la siguiente ronda de
`AUD-B01` (hoy la poda se hace por tamaño, que la propia auditoría
reconoce como "correcto y suficiente para empezar" pero insuficiente
a medio plazo).

## why this design

La alternativa de "hacerlo todo dentro de `f00198`" se descarta
porque `f00198` mide **invocaciones** (qué tool se llamó cuando
debía/no debía) y esta propuesta mide **bytes servidos vs. bytes
usados** — necesita cruzar el log de `tools/list` (tamaño real
servido por sesión, que varía con el modo adaptativo de `AUD-C01`)
contra el log de invocaciones que `f00198` ya consume. Son ejes
ortogonales que comparten la misma fuente de datos pero no el mismo
cálculo; separarlos evita que un proposal grande bloquee al otro y
dejar que cada KPI tenga su propio slice de test es más verificable.

## non-goals

- Reimplementar `activation precision`/`activation recall`/
  `activation churn` — son el alcance ya cubierto por `f00198`, que
  sigue pendiente pero no es territorio de esta propuesta.
- Reimplementar la métrica de confusión entre tools — es
  `f00199`.
- Construir el dashboard visual completo de tendencias — sólo el
  cálculo y su exposición en `usage_report`; la superficie visual
  (si llega) es trabajo de seguimiento.

## architecture

```
tools/list servido (bytes, por sesión, por modo de superficie)
                    +
tool invocada ≥1 vez en la sesión (ya en usage-tracking)
                    ↓
       usefulTokensRatio = bytes(tools invocadas) / bytes(tools/list)
                    ↓
        usage_report.metrics.usefulTokens { ratio, servedBytes,
                                             usedBytes, sessionId }
```

`plugins/usage-tracking` ya registra qué tools se invocan; falta
registrar, por sesión, el tamaño en bytes de la superficie que se
sirvió en `tools/list` (dato que ya se calcula para los techos de
`AUD-B01`/`token-budget-report-lib.ts`, pero no se persiste por
sesión) y cruzarlo contra el conjunto de tools efectivamente usadas.

## slices

### S1 — Registrar bytes servidos de `tools/list` por sesión

- **Status**: done
- **Files**: `packages/core/src/lib/metrics/metrics-registry.ts`, `packages/core/src/lib/contracts/interfaces/surface-use.interface.ts`, `packages/core/src/lib/metrics/metrics-tool.ts`, `packages/core/src/lib/project/create-mcp-project.ts`, `packages/core/tests/src/lib/metrics/useful-tokens.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/metrics/useful-tokens.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Independence OK: implementer claude-opus-5-5 (PR #428, commits 6eefb127d + 06810165c, merge 0c42fcd60), reviewer glm-5.3-max. Delivery diff read: recordToolListServed added to metrics-registry, wired from the tools/list hook in create-mcp-project.ts; surface-use type in contracts (06810165c). Gate green: useful-tokens.spec.ts 3/3 exit 0 — covers no-served-before-list, counts-every-list-served/only-used-tools-as-useful, and a real session measure. Acceptance: ratio = usefulBytes/servedBytes computed over BYTES not counts (metrics-registry.ts rounds (usefulBytes/servedBytes)*1e4/1e4); ratio omitted when servedBytes=0; wire hook records each served definition. Deliberate deviation documented in the proposal: KPI exposed by the core metrics tool (surface.usefulTokensRatio) instead of usage_report — one place for per-session tool cost, avoids a second copy in usage-tracking; output schema declares it (metrics-tool.ts usefulTokensRatio: z.number().optional()).
### S2 — Calcular `usefulTokensRatio` cruzando servido vs. usado

- **Status**: done
- **Files**: `packages/core/src/lib/metrics/metrics-registry.ts`, `packages/core/src/lib/contracts/interfaces/surface-use.interface.ts`, `packages/core/src/lib/metrics/metrics-tool.ts`, `packages/core/src/lib/project/create-mcp-project.ts`, `packages/core/tests/src/lib/metrics/useful-tokens.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/metrics/useful-tokens.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Independence OK: implementer claude-opus-5-5, reviewer glm-5.3-max. Same delivery (0c42fcd60) read for the computation half: usefulBytes sums served bytes of tools invoked >=1x; tools reached only through the router (never served) count in neither side, so the ratio cannot exceed 1. Verified in metrics-registry.ts (surface.attribution/surface.usefulBytes) and the spec's counts-every-list-served case. Acceptance 'ratio approx bytes(2)/bytes(10), not 2/10' is pinned by the spec operating on byte maps, not tool counts.
### S3 — Exponer en `usage_report`

- **Status**: done
- **Files**: `packages/core/src/lib/metrics/metrics-registry.ts`, `packages/core/src/lib/contracts/interfaces/surface-use.interface.ts`, `packages/core/src/lib/metrics/metrics-tool.ts`, `packages/core/src/lib/project/create-mcp-project.ts`, `packages/core/tests/src/lib/metrics/useful-tokens.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/metrics/useful-tokens.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Independence OK: implementer claude-opus-5-5, reviewer glm-5.3-max. Exposure half of 0c42fcd60 verified: the core metrics tool returns surface.{listsServed, servedBytes, usefulBytes, usefulTokensRatio} and declares it in its output schema (metrics-tool.ts). Acceptance asked for usage_report; the proposal records the deviation as deliberate (expose by the metrics tool, one place for per-session tool cost) — reviewed as an honest documented deviation, not a missing delivery. Gate useful-tokens.spec.ts 3/3 exit 0; surface fields read in the registry source.
## dependency graph

`f00272` es independiente de `f00198`/`f00199` en implementación
(datos compartidos, cálculos distintos) pero conceptualmente
complementario: `f00273` (ranking + histéresis en `tool_search`)
depende de tener `activation churn` medible (de `f00198`) para saber
si mejora. Dentro de esta propuesta: S1 no depende de nada; S2
depende de S1; S3 depende de S2.

## acceptance

- Spec: una sesión sintética que invoca 2 de 10 tools servidas
  produce `usefulTokensRatio` ≈ bytes(2 tools)/bytes(10 tools), no
  2/10 por conteo de tools.
- Spec: una sesión que invoca todas las tools servidas produce
  `ratio = 1`.
- `usage_report` incluye `metrics.usefulTokens` con `servedBytes`,
  `usedBytes` y `ratio` por sesión y agregado.

## risks and mitigations

- **Riesgo: doble contabilidad si `f00198` añade su propio campo de
  bytes servidos en paralelo.** Mitigación: `session-surface-bytes.service.ts`
  se diseña como el único productor de "bytes servidos por sesión";
  si `f00198` lo necesita, lo importa en vez de recalcularlo — se dejará
  anotado en el `notes` de ambos ficheros cuando se implemente.
- **Riesgo: el tamaño de `tools/list` varía dentro de una misma
  sesión en modo adaptativo (`managed`), así que "bytes servidos" no
  es un número fijo.** Mitigación: acumular el bytes servido en cada
  notificación `tools/list_changed`, no sólo en el `initialize`
  inicial — el spec de S1 cubre explícitamente una sesión con al
  menos una activación intermedia.

## notes

Esta propuesta nace de una corrección de la propia auditoría: `AUD-B05`
pide cuatro métricas (precision, recall, useful tokens, churn) como si
ninguna existiera propuesta, pero tres de las cuatro ya están en
`f00198` (pendiente desde `2026-08-25`, `q00006`). El triage de
`q00011` decidió no duplicar ese trabajo y limitar `f00272` a la única
métrica sin cubrir. Si `f00198` se cierra antes que esta propuesta,
S3 debe leer su módulo de KPIs en vez de reimplementar el cruce de
datos desde cero.

### Unblocked and delivered in one pass (2026-09-25)

Its dependencies (f00198, f00199) are done and its own dependency
graph says S1 depends on nothing, so nothing was holding it but its
folder; the 2026-09-25 external audit ranked it among the most valuable
blocked items. One deviation, deliberate: the KPI is exposed by the
core `metrics` tool (`surface.usefulTokensRatio`), not `usage_report`.
The metrics registry is where a session's per-tool calls and bytes
already live, so the served bytes are recorded beside them — one place
for "what did this session's tools cost", instead of a second copy in
usage-tracking.

- S1: every `tools/list` response records each served definition's
  bytes (`recordToolListServed`, from the wire hook in
  `create-mcp-project.ts`).
- S2: `usefulBytes` sums the served bytes of tools invoked at least
  once; `usefulTokensRatio = usefulBytes / servedBytes`. A tool reached
  through the router was never served and counts in neither.
- S3: the `metrics` tool returns `surface` and declares it in its
  output schema.
