---
id: f00276
title: "AUD-G01 — error-reporting como embudo observable en report_status"
kind: feat
status: done
type: feat
track: trust
date: 2026-08-27
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-G01
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P0
related: [q00011]
---

# f00276 — `error-reporting` como embudo observable en `report_status`

## Goal

Que `mcpv_report_status` (sin argumentos) responda por sí solo la
pregunta que motivó este proposal — *"¿el plugin de error-reporting
funciona o no?"* — sin que el autor tenga que abrir
`.cache/mcp-vertex/error-reporting/reported.json`. Concretamente:
mostrar `lastFailureCode`, `consecutiveFailureCount`, `circuitOpenUntil`
(y si sigue abierto ahora mismo), la antigüedad del último intento, y
contadores del embudo de nueve etapas — todo derivado de estado ya
persistido, sin tocar la red ni crear ningún issue.

## Why

Verificado contra `2cf17373` (evidencia completa en AUD-G01): el plugin
observó 27 fallos de transporte (`GH_NOT_INSTALLED`), abrió el
cortacircuitos tras 7 fallos consecutivos, y ese estado llevaba 3 días
sin que nada lo hiciera visible fuera de un JSON en `.cache/`. En
paralelo, el log de eventos (856 eventos, 100% `ok`) tampoco podía
corroborarlo porque `tool-failed` nunca se había emitido en esa
ventana. Resultado: dos subsistemas callados y ninguno capaz de decir
cuál de los dos silencios se estaba mirando.

El defecto no estaba en la lógica de reintento — `report-scheduler.helper.ts#decide`
ya compara `circuitOpenUntil` contra `nowMs` en cada llamada, así que un
cortacircuitos vencido ya se reevaluaba correctamente en el siguiente
fallo observado. El defecto real era de **observabilidad**: nada
proyectaba ese estado a un lugar que el autor fuera a mirar, y no había
manera de distinguir "no ha habido fallos" de "el hook dejó de
dispararse".

## Why this design

La "solución arquitectónica ideal" que plantea el hallazgo — contadores
del embudo + `mcpv doctor --deep error-reporting` con autotest en vivo
— se entrega en dos mitades de coste muy distinto:

- Los **contadores del embudo** (`IFunnelCounterStore`) y su proyección
  en `report_status.health`/`report_status.funnel` son baratos,
  puramente locales (nunca dato de host-project) y se implementan por
  completo aquí.
- El **autotest** (`runErrorReportingSelfTest`) también se entrega por
  completo aquí como servicio puro e independiente — corre la pipeline
  real de clasificación/privacidad contra un fallo sintético y, sólo
  con `live: true`, cuatro comprobaciones de `gh` de sólo lectura — pero
  su **wiring** a un comando CLI (`mcpv doctor --deep error-reporting`)
  es explícitamente un no-goal: pertenece al territorio de otro agente
  (`packages/core` / CLI de `doctor`), no a `plugins/error-reporting`.

Contadores en vez de un log de eventos nuevo: el proyecto ya tiene un
sistema de logs de incidentes; duplicar esa infraestructura dentro de
un plugin sería repetir, no derivar. En su lugar, un fallo que abre el
cortacircuitos también se registra una vez como `severity: 'warning'`
en el log de incidentes existente (`ctx.logs`), y el estado agregado
vive en un fichero de contadores nuevo con el mismo idiom de mutex +
escritura atómica que ya usa `reported.json`.

## Non-goals

- **`mcpv doctor --deep error-reporting` (y su flag `--live`)** — el
  autotest que lo alimentaría (`runErrorReportingSelfTest`) se entrega
  aquí como servicio puro y probado; conectarlo a un subcomando de la
  CLI de `doctor` es trabajo de otro territorio (`packages/core`) y
  queda fuera de este proposal.
- No se cambia la lógica de `report-scheduler.helper.ts#decide` /
  `buildFailureState` — ya reevaluaba `circuitOpenUntil` correctamente
  contra el reloj; este proposal es sobre visibilidad, no sobre
  corregir el scheduler.
- No se añade un mecanismo de notificación activa (push, email, aviso
  al arrancar el host) — la solución mínima del hallazgo es que
  `report_status` lo muestre bajo demanda; una notificación proactiva
  es una decisión de producto distinta y no está pedida por AUD-G01.
- No se persiste ningún dato de host-project en los contadores del
  embudo — cada campo es un número, un timestamp ISO o un código de
  enum del propio vocabulario del plugin.

## Architecture

- `plugins/error-reporting/src/lib/contracts/constants/funnel-stages.constant.ts`
  — las nueve etapas del embudo en orden de pipeline
  (`FUNNEL_STAGES`), incluida `ignoredNonFailures` (llamadas exitosas
  observadas, para distinguir "sin fallos" de "hook muerto").
- `plugins/error-reporting/src/lib/contracts/interfaces/funnel-counters.interface.ts`
  — `IFunnelCounters` (contadores + timestamps/código de la última
  ocurrencia de cada hito relevante) e `IFunnelCounterStore`
  (`read` / `increment` / `markClassified`).
- `plugins/error-reporting/src/lib/funnel-counter-store.service.ts` —
  implementación durable: `funnel-counters.json` en el mismo
  `pluginCacheDir` que `reported.json` (misma clase de durabilidad:
  resultado acumulado, no cache derivable), mismo idiom de
  `withFileMutex` + `writeFileAtomic`. Un éxito de envío limpia
  `lastFailureCode`/`circuitOpenUntil` de los contadores, igual que
  `report-store.service.ts#recordSuccess` limpia el registro por
  fingerprint.
- `plugins/error-reporting/src/index.ts` — `buildReportErrorHandler` y
  `buildObservedFailureHandler` reciben un `funnel?: IFunnelCounterStore`
  opcional (con un `NOOP_FUNNEL_STORE` de fallback para no romper
  llamadores existentes) e incrementan la etapa correspondiente en cada
  punto de decisión de la pipeline (no-interno, bloqueado por
  privacidad, deduplicado/rate-limited, intentado, éxito, fallo). Al
  abrirse el cortacircuitos, además emite un `ctx.logs.log({ severity:
  'warning', incidentType: 'error-reporting-circuit-open', ... })` — un
  fallo de clase P0 ya no corre en silencio total.
- `plugins/error-reporting/src/lib/tools/report-status.tool.ts` —
  `healthOf(records, nowMs)` (pura, exportada) reduce todos los
  registros por fingerprint al peor estado observable (más fallos
  consecutivos, empate por intento más reciente) y calcula
  `circuitOpen` comparando contra `nowMs` — es la misma comparación
  temporal que ya usa el scheduler, proyectada al DTO de salida. La
  salida de la tool gana `health: IReportStatusHealth` y
  `funnel: IFunnelCounters`; ambos son objetos densos de números/
  timestamps/códigos, no un volcado por-fingerprint.
- `plugins/error-reporting/src/lib/self-test.service.ts` +
  `.../contracts/interfaces/self-test.interface.ts` —
  `runErrorReportingSelfTest`: diez checks con id estable
  (`SELF_TEST_CHECK_IDS`), corre siempre la pipeline de clasificación +
  privacidad contra un fallo sintético (nunca un fallo real) y, sólo
  con `live: true`, cuatro comprobaciones de `gh` de sólo lectura
  (`--version`, `auth status`, `repo view`, `api .../permissions.push`)
  a través de un seam de exec inyectable. `guardReadOnlyGhCall` lanza si
  cualquier check llegara a construir `['issue', 'create', ...]` — cinturón
  y tirantes sobre el hecho de que ningún check de la lista lo hace.
- Tests: cobertura del store (`funnel-counter-store.spec.ts`), de la
  reconciliación end-to-end embudo↔pipeline
  (`funnel-reconciliation.spec.ts`), del autotest
  (`self-test.service.spec.ts`), y de la reevaluación del
  cortacircuitos vencido (`stale-circuit-reevaluation.spec.ts`) —
  ver Acceptance.

## Slices

### S1 — contratos + store de contadores del embudo

- **Status**: done
- **Files**: `plugins/error-reporting/src/lib/contracts/constants/funnel-stages.constant.ts`, `plugins/error-reporting/src/lib/contracts/interfaces/funnel-counters.interface.ts`, `plugins/error-reporting/src/lib/funnel-counter-store.service.ts`, `plugins/error-reporting/tests/funnel-counter-store.spec.ts`
- **Gate**: `bunx vitest run --project error-reporting -- funnel-counter-store`

### S2 — wiring del embudo en la pipeline de reporte + log de incidente al abrir el cortacircuitos

- **Status**: done
- **Files**: `plugins/error-reporting/src/index.ts`, `plugins/error-reporting/tests/funnel-reconciliation.spec.ts`
- **Gate**: `bunx vitest run --project error-reporting -- funnel-reconciliation`

### S3 — `report_status` expone `health` + `funnel` sin argumentos

- **Status**: done
- **Files**: `plugins/error-reporting/src/lib/contracts/interfaces/report-status.interface.ts`, `plugins/error-reporting/src/lib/tools/report-status.tool.ts`, `plugins/error-reporting/tests/report-status.tool.spec.ts`
- **Gate**: `bunx vitest run --project error-reporting -- report-status.tool`

### S4 — reevaluación del cortacircuitos vencido (regresión + E2E)

- **Status**: done
- **Files**: `plugins/error-reporting/tests/stale-circuit-reevaluation.spec.ts`
- **Gate**: `bunx vitest run --project error-reporting -- stale-circuit-reevaluation`

### S5 — autotest de diagnóstico (`runErrorReportingSelfTest`), sin issue creation

- **Status**: done
- **Files**: `plugins/error-reporting/src/lib/contracts/interfaces/self-test.interface.ts`, `plugins/error-reporting/src/lib/self-test.service.ts`, `plugins/error-reporting/tests/self-test.service.spec.ts`, `plugins/error-reporting/src/public/index.ts`
- **Gate**: `bunx vitest run --project error-reporting -- self-test.service`

> **Nota (2026-08-29).** Este proposal tuvo un sexto slice para cablear
> `runErrorReportingSelfTest` a `mcpv doctor --deep error-reporting [--live]`.
> No era un slice: era trabajo de otro subsistema (`packages/cli`), y dejarlo
> como slice `non-goal` dentro de un proposal en `done/` es exactamente la
> deriva que `lint:proposal-slice-completeness` existe para cazar — el lint lo
> cazó. La propiedad de ese cableado pasa a `f00275` (`mcpv doctor --deep`),
> que es quien construye ese comando. Aquí queda como Non-goal declarado, no
> como trabajo pendiente disfrazado de hecho.

## Dependency graph

```
S1 ──► S2 ──► S3
        │
        └────► S4   (S4 ejercita el handler de S2 y el store de S1)

S5 es independiente de S1-S4 (no depende del embudo; reutiliza la
pipeline de clasificación/privacidad ya existente).

S6 depende de S5 (necesita `runErrorReportingSelfTest` como servicio)
pero vive fuera de este proposal.
```

## Acceptance

1. `mcpv_report_status` sin argumentos incluye `health.lastFailureCode`,
   `health.consecutiveFailureCount`, `health.circuitOpenUntil`,
   `health.circuitOpen` (recalculado contra el reloj real, no un flag
   fijo) y `health.lastAttemptAgeMs`, derivados del registro en peor
   estado sin necesidad de pasar ningún fingerprint.
2. `mcpv_report_status` incluye `funnel` con los nueve contadores de
   `FUNNEL_STAGES` y sus timestamps/código asociados — todos números,
   timestamps ISO o códigos de enum, nunca contenido de host-project.
3. Un cortacircuitos cuyo `circuitOpenUntil` ya pasó se reevalúa en el
   siguiente fallo observado: `stale-circuit-reevaluation.spec.ts`
   reproduce exactamente la evidencia de la auditoría (27 intentos,
   umbral de 7 fallos consecutivos, `circuitOpenUntil` en el pasado) y
   comprueba que el siguiente intento reintenta el transporte y, si
   ahora tiene éxito, limpia `consecutiveFailureCount` y
   `circuitOpenUntil` tanto en el store por-fingerprint como en el
   embudo.
4. El autotest (`runErrorReportingSelfTest`) nunca invoca el seam de
   exec con `['issue', 'create', ...]` — cubierto explícitamente por
   `self-test.service.spec.ts` iterando cada llamada real al mock.
5. Los lints de privacidad del plugin
   (`privacy-tool-id.script.ts`, `privacy-internal-only.script.ts`)
   siguen en verde con los ficheros nuevos.
6. La propiedad preexistente "un fallo del propio plugin nunca afecta
   a la llamada de tool original" se mantiene: todo el cuerpo de
   `buildReportErrorHandler` sigue envuelto en un único `try/catch`
   que traga cualquier excepción, y `onToolCall`/`onRegisterError`/
   `onHookError` siguen invocando sus handlers con `void` (fire-and-forget).
7. `bunx vitest run --project error-reporting` en verde; `bun
   tools/scripts/lint/proposals.script.ts`,
   `tools/scripts/typecheck.script.ts`,
   `lint/privacy-tool-id.script.ts`,
   `lint/privacy-internal-only.script.ts` y
   `lint/types-in-contracts.script.ts` en verde.

## Risks and mitigations

| Riesgo | Mitigación |
| --- | --- |
| El campo `funnel` infla el tamaño de la respuesta de una tool MCP en un repo que vigila presupuestos de tokens | Es un objeto denso de 9 números + hasta 5 timestamps/códigos opcionales — decenas de bytes, no un dump por-fingerprint; medido en la verificación de este proposal (ver notas del agente que auditó el trabajo) |
| Los contadores del embudo divergen del store por-fingerprint si un caller pasa `funnel` a una llamada pero no a otra | `NOOP_FUNNEL_STORE` hace que omitir `funnel` sea un no-op explícito y byte-idéntico al comportamiento anterior, nunca un estado a medias |
| El autotest en modo `live: true` podría, por error de implementación futura, llegar a intentar crear un issue real | `guardReadOnlyGhCall` lanza de forma síncrona si cualquier `argv` construido internamente empieza por `['issue', 'create']`, y el propio catálogo de checks (`SELF_TEST_CHECK_IDS`) sólo contempla subcomandos de lectura |
| `healthOf` interpreta mal qué registro es "el peor" cuando hay múltiples fingerprints en estados distintos | Criterio explícito y probado: más fallos consecutivos gana; empate se rompe por intento más reciente; `undefined` sólo cuando ningún registro ha fallado nunca |

## Notes

- La lógica de reevaluación temporal del cortacircuitos
  (`report-scheduler.helper.ts#decide`) no se modificó en este
  proposal — ya comparaba `circuitOpenUntil` contra `nowMs` en cada
  llamada. Lo que faltaba, y es lo que este proposal entrega, es que
  ese estado —y el hecho de que la pipeline lo reintenta correctamente—
  sea visible sin leer `reported.json` a mano.
- El wiring de `runErrorReportingSelfTest` a un comando de CLI
  (`mcpv doctor --deep error-reporting`) es la única pieza de la
  "solución arquitectónica ideal" del hallazgo que queda deliberadamente
  fuera: el servicio está listo y probado en
  `plugins/error-reporting/src/public/index.ts` para que ese wiring lo
  consuma directamente.
