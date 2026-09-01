---
id: r00037
title: "EffectBroker: dry-run pasa de detección post-hoc a prevención real"
kind: refactor
status: done
type: proposal
track: security
date: 2026-08-29
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-D02
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P1
related: [q00011, x00288, x00292]
---

# r00037 — `EffectBroker`: dry-run pasa de detección post-hoc a prevención real

> **CORRECCIÓN (implementación, 2026-08-29).** La premisa de "why" —
> citando el header de `effect-guard.helper.ts`: *"`IMcpPluginContext`
> ... does not currently hand plugins a filesystem/git/spawn/network
> capability object at all"* — **ya no era cierta en el momento de
> implementar esta propuesta**. El commit `8f05b5d2` ("feat(core):
> inject a dry-run-gated effects capability into plugins"), fechado el
> mismo día que el audit (2026-08-27, 13:15, posterior a la
> verificación línea-por-línea que cita el "why"), ya había cableado
> exactamente el mecanismo de prevención que S2/S3 piden — pero
> limitado a UNA capacidad (`git`), no generalizado. Concretamente, ya
> existían y estaban en producción:
> `dry-run/dry-run-scope.helper.ts` (scope ambiental
> `AsyncLocalStorage`, abierto por `invokeTool` alrededor de CADA
> handler), `dry-run/effect-capability-factory.helper.ts`
> (`createDryRunGatedGitRunner`), `contracts/interfaces/effect-capabilities.interface.ts`
> (`IPluginEffectsCapability.git`), y `cli/assemble.ts` pasando ese
> `git` guardado a TODOS los plugins vía `ctx.effects` (no solo a 6 de
> 51 — la cifra que el propio "why" ya advertía no haber re-contado).
> El trabajo real de esta propuesta, tal y como se ejecutó, fue: (S2)
> generalizar el patrón ad-hoc de una sola capacidad en una primitiva
> de composición reutilizable (`EffectBroker`), y (S3) hacer que el
> caso real (`assemble.ts`) pasara también por esa primitiva en vez de
> llamar a `createDryRunGatedGitRunner` directamente — no "cablear
> algo que no existía", sino "generalizar y centralizar algo que ya
> existía para un solo caso". Ver el Status de cada slice para el
> detalle exacto de qué tocó código nuevo y qué ya estaba hecho.

## Goal

Que `dryRun: true` sea, para **todo** plugin, una barrera que hace
imposible el efecto — no una convención de buena fe verificada
después de que el handler ya corrió. Concretamente: cablear
`guardEffectCapability`/`runWithDryRunGate` (ya existentes en
`packages/core/src/lib/dry-run/effect-guard.helper.ts`, hoy opt-in y
sin consumidores en el runtime) en el único punto por el que **todo**
handler pasa — `invokeTool` en
`packages/core/src/lib/project/tool-surface-runtime.service.ts` — de
modo que ningún plugin pueda alcanzar un efecto mutador mientras
`dryRun` esté activo, la use o no explícitamente.

## why

**Comportamiento actual verificado.** `invokeTool` abre el scope
ambiental de dry-run ANTES de llamar al handler
(`runWithDryRunScope`, `tool-surface-runtime.service.ts:594-601`) y
valida el resultado DESPUÉS (`this.applyDryRunContract(...)` en la
línea 604, que llama a `enforceDryRunReturnContract` en
`packages/core/src/lib/dry-run/enforce.ts:91`). El propio comentario
del código en la línea 592 lo dice explícitamente: la comprobación
ocurre sobre el valor de retorno, con el handler ya ejecutado.

`packages/core/src/lib/dry-run/effect-guard.helper.ts` ya contiene la
primitiva de prevención real: `guardEffectCapability` envuelve una
función mutadora en el punto de construcción y, si `dryRun` es
`true`, lanza `DryRunEffectRefusedError` **antes** de llegar al
`perform` real — la mutación es imposible, no solo detectable. El
propio header del fichero lo confirma: *"both helpers are opt-in at
the call site that WIRES a capability. `IMcpPluginContext`
(`packages/core/src/lib/plugins/plugin-contract.ts`) does not
currently hand plugins a filesystem/git/spawn/network capability
object at all — plugins call `fs`, `child_process`, `fetch`, etc.
directly inside their own handler code."* Es decir: la primitiva de
prevención existe, está probada y **no la usa nadie en el runtime**.

**Verificación independiente del hallazgo (no doy la cifra del
informe por buena sin comprobarla).** Confirmado línea a línea contra
`packages/core/src/lib/project/tool-surface-runtime.service.ts:485-613`
y `packages/core/src/lib/dry-run/effect-guard.helper.ts` en esta
sesión — el hallazgo se sostiene exactamente como lo describe
`AUD-D02`, sin matices que corregir. La cifra "6 de 51" de plugins
que usan la capacidad opt-in no se ha vuelto a contar aquí (no es
crítica para el diseño de esta propuesta, que asume el peor caso: 0
plugins obligados); si el conteo exacto importa para priorizar la
migración de S3, un slice de investigación puede recontarla antes de
tocar plugins concretos.

**Por qué es un problema.** `dryRun: true` es hoy una convención que
un plugin de terceros puede ignorar por completo: escribe en disco,
hace `git push`, lanza un subproceso o llama a una red externa, y el
runtime solo informa DESPUÉS de que el daño ya ocurrió. Es un reporte
forense, no un control de seguridad. El proyecto declara como
objetivo cargar plugins de terceros (`plugin:create`,
`create_project`, external MCPs) — el riesgo es crítico precisamente
en ese escenario, donde no hay garantía de que el autor del plugin
lea `args.dryRun`.

## why this design

La alternativa mínima —seguir sólo "haciendo más ruidosa" la
detección post-hoc (registrar la violación en el log de auditoría,
exponerla en `report_status`)— no cambia la naturaleza del contrato:
sigue siendo "el plugin debería no escribir", nunca "el runtime hace
imposible escribir". Se implementa igualmente como paso intermedio
(S1, de bajo riesgo y sin cambios de superficie) porque da presión de
migración medible mientras el `EffectBroker` completo no cubre a
todos los plugins, pero no sustituye el objetivo arquitectónico.

El diseño ideal — un `EffectBroker` que intermedia entre la
declaración de efectos de una tool, la política, `dryRun`, la
confianza del plugin y el workspace, y que es el ÚNICO camino para
alcanzar `ctx.effects.{fs,git,process,network,database,browser}` — no
se construye en una sola pieza: `guardEffectCapability` y
`runWithDryRunGate` son las primitivas de más bajo nivel del broker y
ya existen; falta la capa de composición (`EffectBroker` en sí) y la
integración obligatoria en el ciclo de vida de cada plugin. Separar
esto en slices permite validar la primitiva de composición con un
plugin sintético antes de tocar el árbol real de 51 plugins, y dejar
la migración masiva de plugins como trabajo de seguimiento explícito
(fuera de esta propuesta) en línea con `r00034` (que ya cubre la
migración de plugins concretos a la capa de capabilities).

## non-goals

- Migrar los 51 plugins existentes a `ctx.effects` — es el objetivo
  de `r00034` (migración de plugins con efectos a la capa de
  capabilities), que depende de esta propuesta pero no está incluido
  aquí.
- El lint de fronteras de efectos que prohíbe `node:fs`/
  `child_process`/`net`/`http` fuera de adaptadores autorizados — es
  `x00288` (dependencia declarada de esta propuesta en el grafo de
  `q00011`: `x00288 ──► r00037 ──► x00292`).
- Cambiar la firma pública de `IMcpPluginContext` para plugins que no
  usan efectos — sin efectos declarados, un plugin no recibe
  `ctx.effects` y no se ve afectado.

## architecture

```
tool effect declaration × policy × dryRun × trust × workspace
                              ↓
                        EffectBroker (nuevo)
                              ↓
      ctx.effects.{fs,git,process,network,database,browser}
                              ↓
     guardEffectCapability / runWithDryRunGate (ya existen)
                              ↓
              capacidad real  |  DryRunEffectRefusedError
```

`packages/core/src/lib/capabilities/effect-broker.ts` (nuevo) expone
`createEffectBroker(input: { dryRun: boolean; declaredEffects:
readonly TEffectCapabilityKind[]; trust: ... })` que, para cada
capacidad declarada por el plugin en su manifest, construye la
función real (`fs.writeFile`, `execFile`, `fetch`, etc.) SIEMPRE a
través de `guardEffectCapability`. El plugin nunca ve la función sin
envolver — el broker es el único punto de construcción. Se integra en
`packages/core/src/lib/plugins/plugin-contract.ts` (la interfaz de
`IMcpPluginContext` gana un campo `effects` opcional, poblado por el
broker cuando el plugin declara efectos) y en el punto donde el
runtime construye el contexto por invocación
(`tool-surface-runtime.service.ts`), leyendo el mismo flag de
`dryRun` que ya usa `runWithDryRunScope`.

## slices

### S1 — Detección post-hoc ruidosa y persistente (paso intermedio, sin cambios de superficie)

- **Status**: done
- **Files**:
    - `packages/core/src/lib/dry-run/enforce.ts` (sin cambios: se
      mantuvo puro a propósito; el registro con `pluginId`/`toolId`
      se hace en el call site —
      `tool-surface-runtime.service.ts#applyDryRunContract`— que ya
      conoce ambos valores, no dentro de la función pura)
    - `packages/core/src/lib/dry-run/dry-run-violation-log.ts` (nuevo:
      buffer acotado análogo a
      `listForcePushAuthorizations`/`clearForcePushAuthorizationsForTests`
      en `packages/core/src/lib/shared/git-write.ts`)
    - `packages/core/src/lib/contracts/interfaces/dry-run-violation.interface.ts` (nuevo)
    - `packages/core/src/lib/project/tool-surface-runtime.service.ts`
      (`applyDryRunContract` ahora recibe `pluginId` y llama a
      `recordDryRunViolation`)
    - `packages/core/tests/src/lib/dry-run/enforce.spec.ts` (nuevo)
    - `packages/core/tests/src/lib/dry-run/dry-run-violation-log.spec.ts` (nuevo)
    - `packages/core/tests/src/lib/dry-run/router-enforcement.spec.ts`
      (dos specs nuevos: la violación se registra con
      `pluginId`/`tool`, y un handler que SÍ respeta el contrato no
      registra nada)
- **Gate**: `bunx vitest run packages/core/tests/src/lib/dry-run` — 50/50 passing.

### S2 — `EffectBroker`: primitiva de composición

- **Status**: done
- **Files**:
    - `packages/core/src/lib/capabilities/effect-broker.ts` (nuevo)
    - `packages/core/src/lib/contracts/interfaces/effect-broker.interface.ts` (nuevo)
    - `packages/core/tests/src/lib/capabilities/effect-broker.spec.ts` (nuevo)
- **Gate**: `bunx vitest run packages/core/tests/src/lib/capabilities/effect-broker.spec.ts` — 7/7 passing (incluye la property test sobre las 5 categorías de `TEffectCapabilityKind`).
- **Nota de diseño**: la firma difiere de la sugerida (`createEffectBroker(input: { dryRun: boolean; ... })`) — usa el flag ambiental ya existente (`getActiveDryRunFlag()`, `dry-run-scope.helper.ts`) en vez de un `dryRun: boolean` estático, porque ese es el patrón YA enviado a producción (commit `8f05b5d2`, mismo día que el audit) para el caso real (`ctx.effects.git`) y es estrictamente más fuerte: cubre el caso "contexto construido una vez en `register()`, reutilizado en cada llamada" que un `dryRun` capturado en construcción no cubre. Ver "correcciones" más abajo.

### S3 — Integración obligatoria en `IMcpPluginContext` + plugin sintético de prueba

- **Status**: done
- **Files**:
    - `packages/core/src/lib/plugins/plugin-contract.ts` — **sin
      cambios**: el campo `effects?: IPluginEffectsCapability` ya
      existía (commit `8f05b5d2`, ver corrección abajo).
    - `packages/core/src/lib/project/tool-surface-runtime.service.ts`
      — el wiring `runWithDryRunScope` alrededor del handler ya
      existía (mismo commit); el único cambio de esta propuesta ahí
      es el de S1 (pasar `pluginId` a `applyDryRunContract`).
    - `packages/core/src/lib/cli/assemble.ts` — reemplazado el
      constructor manual de `pluginEffects` (una llamada directa a
      `createDryRunGatedGitRunner`) por `createEffectBroker({ git: {...} })`,
      para que el broker sea el único punto de construcción también
      en el caso real, no solo en los tests.
    - `packages/core/tests/src/lib/e2e/effect-broker-dry-run.e2e.spec.ts` (nuevo)
- **Gate**: `bunx vitest run packages/core/tests/src/lib/e2e/effect-broker-dry-run.e2e.spec.ts` — 7/7 passing.
- **Corrección al plan**: el spec NO usa `ctx.effects.fs.write` — esa
  capacidad no existe (`IPluginEffectsCapability` solo declara `git`,
  deliberadamente, ver `effect-capabilities.interface.ts`). El plugin
  sintético usa `createEffectBroker` directamente con las 5 categorías
  reales de `TEffectCapabilityKind` (`write`/`delete`/`spawn`/`network`/`git`),
  más un caso adicional con el `git` runner REAL contra un repo temporal
  en disco (no un proxy en memoria) para la prueba de "sin rastro".

### S4 — Documentación del contrato de garantías

- **Status**: done
- **Files**: `docs/mcp-vertex/security/dry-run-contract.md` (nuevo)
- **Gate**: `bun tools/scripts/lint/proposals.script.ts` → `624 files
  checked, 223 legacy file(s) skipped, 0 fatal error(s)`. Revisión
  manual: el documento distingue explícitamente, por capacidad, qué
  garantiza `dryRun` hoy (prevención real solo para `ctx.effects.git`;
  detección auditada — no prevención — para todo lo demás).

## dependency graph

`x00288` (lint de fronteras de efectos) va antes en el grafo de
`q00011` porque, sin él, un plugin puede seguir llegando a `node:fs`
directo aunque el broker exista — el broker solo protege lo que pasa
por `ctx.effects`. `x00292` (protectedBranches obligatorio en
`gitPush`) depende de esta propuesta porque la firma dura de
`gitPush` es el mismo patrón de "hacer el compilador exija la
decisión" que se aplica aquí a nivel de capacidades. Dentro de esta
propuesta: S1 es independiente y puede ir sola; S2 no depende de S1;
S3 depende de S2; S4 depende de S1+S2+S3 (documenta el estado
después de ambos).

## acceptance

- Spec: un plugin sintético que ignora `dryRun` y llama a
  `ctx.effects.fs.write` con `dryRun: true` no escribe el fichero y
  recibe `DryRunEffectRefusedError`.
- Spec: el mismo plugin usando `node:fs` directo (sin pasar por el
  broker) sigue sin ser detectado por esta propuesta — ese caso lo
  cierra `x00288` en CI, no el runtime.
- Property test: para cualquier combinación de política × dryRun ×
  trust, el broker nunca concede una capacidad mutadora con
  `dryRun: true`.
- `docs/mcp-vertex/security/dry-run-contract.md` documenta
  explícitamente el antes/después.

## risks and mitigations

- **Riesgo: cambio mayor para plugins de terceros que ya usan
  `ctx.effects` con supuestos distintos.** Mitigación: el broker
  mantiene la misma forma de API que `guardEffectCapability` ya
  publica; sólo cambia QUIÉN construye la capacidad (el broker, no el
  plugin), no su interfaz de llamada — ventana de migración
  documentada en `notes`.
- **Riesgo: S3 introduce latencia por invocación al construir
  capacidades envueltas.** Mitigación: la construcción ocurre una vez
  por invocación de tool (no por llamada a la capacidad), igual que
  hoy hace `runWithDryRunScope`; medir con el benchmark existente de
  `tool-surface-runtime` antes de mergear.
- **Riesgo: el plugin sintético de S3 da falsa confianza si no cubre
  las 6 categorías de efecto (`fs`, `git`, `process`, `network`,
  `database`, `browser`).** Mitigación: el spec de S3 parametriza
  sobre las 6 categorías declaradas en
  `TEffectCapabilityKind` (`packages/core/src/lib/contracts/interfaces/effect-guard.interface.ts`).

## notes

Esta propuesta depende de `x00288` (D01) para que la frontera sea
completa: sin el lint de fronteras, un plugin puede seguir evitando
el broker por completo importando `node:fs` en su propio código. La
migración de los 51 plugins concretos a declarar sus efectos y
recibir `ctx.effects` es el alcance de `r00034` — esta propuesta sólo
construye la primitiva y demuestra la propiedad con un plugin
sintético, no la aplica retroactivamente a todo el árbol.

Ficheros de referencia:

- `packages/core/src/lib/project/tool-surface-runtime.service.ts:485-613`
- `packages/core/src/lib/dry-run/effect-guard.helper.ts`
- `packages/core/src/lib/dry-run/enforce.ts`
- `packages/core/src/lib/shared/git-write.ts` (idioma de buffer
  acotado copiado para S1)
