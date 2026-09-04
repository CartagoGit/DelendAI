---
id: f00272
title: "Useful tokens: qué fracción de `tools/list` se usa de verdad"
kind: feat
status: blocked
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

- **Status**: pending
- **Files**:
    - `plugins/usage-tracking/src/lib/session-surface-bytes.service.ts` (nuevo)
    - `plugins/usage-tracking/src/index.ts` (cablear el hook de
      `tools/list` existente para reportar el tamaño servido)
    - `plugins/usage-tracking/tests/session-surface-bytes.spec.ts` (nuevo)
- **Gate**: `bunx vitest run plugins/usage-tracking/tests/session-surface-bytes.spec.ts`

### S2 — Calcular `usefulTokensRatio` cruzando servido vs. usado

- **Status**: pending
- **Files**:
    - `plugins/usage-tracking/src/lib/useful-tokens.service.ts` (nuevo)
    - `plugins/usage-tracking/tests/useful-tokens.spec.ts` (nuevo,
      con logs sintéticos de sesión: 0% uso, 100% uso, uso parcial)
- **Gate**: `bunx vitest run plugins/usage-tracking/tests/useful-tokens.spec.ts`

### S3 — Exponer en `usage_report`

- **Status**: pending
- **Files**:
    - `plugins/usage-tracking/src/lib/tools/usage-report.tool.ts`
    - `plugins/usage-tracking/tests/usage-report.tool.spec.ts`
- **Gate**: `bunx vitest run plugins/usage-tracking/tests/usage-report.tool.spec.ts`

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
