---
id: x00286
title: "evictIdlePlugins descarga el plugin de verdad (dispose + relazy)"
kind: fix
status: done
type: fix
track: adaptive-surface
date: 2026-08-27
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-C02
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P1
related: [q00011, x00285, r00038]
---

# x00286 — `evictIdlePlugins` descarga el plugin de verdad (dispose + relazy)

## Goal

Hacer que `evictIdlePlugins()` en `tool-surface-runtime.service.ts` tenga un
efecto observable real: cuando un plugin sale del working set (por
`idleTtlMs` o por `maxWarmPlugins`), su `dispose()` se invoca y sus tools
vuelven a un estado perezoso (`lazyActivate`) que la siguiente invocación
reactiva de forma transparente — sin nunca evictar un plugin con trabajo en
vuelo.

## Why

Verificado línea a línea contra `2cf17373`
(`packages/core/src/lib/project/tool-surface-runtime.service.ts:558-582`):

```ts
evictIdlePlugins(nowMs = Date.now()): readonly string[] {
	// ... sólo this.warmAtByPlugin.delete(pluginId) ...
}
```

`evictIdlePlugins` sólo borra entradas de `warmAtByPlugin`, un `Map` de
bookkeeping. No llama a `dispose()`, no libera memoria, no oculta tools. Su
valor de retorno se descarta en los dos únicos sitios que la invocan
(`:370` dentro de `getProjectContext`, `:586` dentro de `touchPlugin`). El
único efecto observable de cambiar `maxWarmPlugins` es qué nombres aparecen
en `project_context.warmPlugins` — un array de bookkeeping mostrando otro
array de bookkeeping.

Mientras tanto la opción está completamente expuesta: tipada y validada en
`config-file-schema.ts:147-148`, leída en `load-config-file.ts:75-76`,
mapeada en `cli/assemble.ts:682-688`, e impresa como si fuese real en
`startup-report/renderer.ts:201` (`max warm plugins ${...}`). Un adoptante
que fija `maxWarmPlugins: 1` para acotar memoria no obtiene ningún efecto y
no tiene forma de saberlo — la clase de bug más dañina: configuración
documentada, tipada, validada por esquema, mostrada en el informe de
arranque, y sin efecto.

## Why this design

**La maquinaria de reactivación ya existe, sólo falta el camino de
vuelta.** `r00038` (commit `58be8f3a`) hizo que la ruta lazy retenga el
`dispose` de cada plugin activado y expuso `IManagedLazyRuntime.disposeAll()`
idempotente. `tool-surface-runtime.service.ts` ya tiene `lazyActivate` por
tool y `setLazyPluginLoader` para el camino de ida (frío → caliente). Lo
que falta es el camino inverso (caliente → frío) dentro del mismo runtime.

**El punto de inyección correcto es un `setPluginDisposer`, no una
reestructuración de `managed-lazy-runtime.ts`.** `IManagedLazyRuntime` de
`r00038` expone `disposeAll()` (para el apagado completo del proceso) pero
no un dispose por-plugin individual — añadir uno, y conectarlo desde
`create-mcp-project.ts`/`assemble-plugins.ts`, es trabajo de cableado fuera
del territorio de esta propuesta (ambos archivos están fuera de alcance
para esta slice de `q00011` S5, marcados "recién reescritos, consumir, no
reestructurar"). Esta propuesta construye el mecanismo completo y
correctamente probado en el lado que sí le corresponde
(`tool-surface-runtime.service.ts` + `contracts/interfaces/tool-surface.interface.ts`):
un `setPluginDisposer(disposer)` opcional, análogo a `setLazyPluginLoader`
ya existente, que el host puede conectar a cualquier fuente de `dispose`
por-plugin. Sin un disposer conectado, la evicción sigue haciendo la mitad
honesta del trabajo (des-registra el handler, fuerza relazy, deja de
contarlo como cargado) — nunca finge haber liberado recursos que no puede
nombrar.

**Sólo se evictan plugins que pueden volver.** Un plugin cuyas tools se
registraron sólo por `bindRegisteredTool` (sin haber pasado nunca por
`bindLazyTool`) no tiene un `lazyActivate` retenido al que volver — evictarlo
dejaría sus tools con un handler que apunta a nada. `isPluginEvictable`
exige que **todas** las registrations del plugin tengan un activador lazy
retenido; si no, el plugin permanece caliente y no cuenta como evictado.
Esto es deliberadamente conservador: nunca finge una eviction que
rompería la siguiente invocación.

**Nunca evictar con trabajo en vuelo — el bug estaba también en la rama
LRU, no sólo en el TTL.** La rama `idleTtlMs` ya comprobaba
`inFlightByPlugin` antes de este fix; la rama `maxWarmPlugins` (LRU) NO lo
hacía — un plugin con una invocación activa podía ser seleccionado como "el
más antiguo" y evictado a mitad de ejecución. Esta propuesta corrige ambas
ramas con la misma guarda.

**Concurrencia:** el `dispose()` real de un plugin puede ser asíncrono
(cerrar un proceso hijo, un timer). `evictIdlePlugins()` sigue siendo
síncrona en su firma (decide qué evictar y actualiza el bookkeeping al
instante, como antes) pero programa la disposición real como una tarea de
fondo rastreada por plugin (`disposalsInFlight`); `invokeTool` espera esa
tarea antes de decidir si necesita reactivar, así que una invocación que
llega justo durante la disposición nunca ve un estado a medio transicionar
ni dispara una segunda disposición concurrente del mismo plugin.

## Non-goals

- ~~No se conecta un `dispose()` real de proceso/módulo desde
  `create-mcp-project.ts` o `managed-lazy-runtime.ts` en esta
  propuesta~~ — **superado por S4** (territorio reasignado en una
  sesión posterior de `q00011`): `managed-lazy-runtime.ts` gana
  `disposePlugin(pluginId)` y `create-mcp-project.ts`/
  `assemble-plugins.ts` lo conectan a `setPluginDisposer`. El mecanismo
  descrito abajo (relazy transparente, protección de trabajo en vuelo,
  políticas `null`) seguía siendo correcto tal cual estaba escrito —
  sólo faltaba el cableado, ahora hecho.
- No se toca la semántica `visible` / `hidden` / `deactivated`: la eviction
  nunca cambia `access` — un plugin evictado que estaba `visible` sigue
  `visible` en `tools/list`; sólo su despacho interno vuelve a ser
  perezoso.
- No se cambia el esquema de configuración (`config-file-schema.ts`,
  `load-config-file.ts`, `cli/assemble.ts`) — `idleTtlMs`/`maxWarmPlugins`
  ya estaban correctamente tipados y validados; el bug era enteramente de
  efecto, no de validación.

## Architecture

```
ToolSurfaceRuntime (tool-surface-runtime.service.ts)
 ├── lazyActivatorsByRegistrationId: Map<registrationId, activate>
 │      poblado en bindLazyTool() y NUNCA borrado — es la memoria
 │      permanente de "cómo volver a calentar esta tool", independiente
 │      de que el record actual ya tenga handler.
 ├── pluginDisposer?: (pluginId) => Promise<void>
 │      inyectado vía setPluginDisposer(); ausente por defecto.
 ├── disposalsInFlight: Map<pluginId, Promise<void>>
 │      una entrada por disposición en curso; invokeTool la espera antes
 │      de decidir si reactivar.
 │
 ├── isPluginEvictable(pluginId): boolean
 │      todas las registrations del plugin están en
 │      lazyActivatorsByRegistrationId.
 │
 ├── evictIdlePlugins(nowMs): readonly string[]      [síncrona, sin cambio de firma]
 │      TTL:  salta si inFlight > 0 (ya existía) o !isPluginEvictable (nuevo)
 │      LRU:  salta si inFlight > 0 (NUEVO — antes no se comprobaba) o
 │            !isPluginEvictable
 │      por cada evictado → scheduleDisposal(pluginId)  (fire-and-forget
 │      rastreado, no bloquea el retorno síncrono)
 │
 ├── scheduleDisposal(pluginId)
 │      await pluginDisposer?.(pluginId)  (best-effort; error → log warn,
 │      no interrumpe la disposición de otros plugins)
 │      → rebindPluginAsLazy(pluginId)
 │      → log observable: "[surface] evicted plugin ... "
 │
 └── rebindPluginAsLazy(pluginId)
        por cada registrationId del plugin: handler ← undefined,
        lazyActivate ← lazyActivatorsByRegistrationId.get(id)
        (inputSchema/outputSchema/description NO se tocan: son metadata
        estática, no recursos vivos)
        loadedPluginIds.delete(pluginId)  — deja de reportarse como
        cargado, ahora que de verdad no lo está.

invokeTool(name, args, extra)
 └── si record.pluginId tiene una disposalsInFlight pendiente → await antes
     de decidir; luego, si handler === undefined && lazyActivate !== undefined
     (ya existía) → reactiva exactamente igual que la primera vez.
```

## Slices

### S1 — activadores retenidos + `isPluginEvictable` + guarda de trabajo en vuelo en LRU

- **Status**: done
- **Nota**: `isPluginEvictable` cambia el comportamiento observable de
  dos tests preexistentes en `tool-surface-runtime.spec.ts` ("keeps a
  bounded routed working set..." y "does not evict a plugin while a
  routed call holds an active lease"), que construían sus plugins sólo
  con `bindRegisteredTool` (nunca `bindLazyTool`) — la forma sintética
  que ningún plugin real toma (`assemble-plugins.ts` retiene un
  activador lazy para TODO plugin, sin importar el modo). Sin un
  activador retenido esos plugins no tenían camino de vuelta, así que
  `isPluginEvictable` los excluía y ambos tests fallaban. Se
  actualizaron para añadir el `bindLazyTool` que la forma de producción
  siempre tiene, preservando la intención original de cada test.
- **Files**: [`packages/core/src/lib/project/tool-surface-runtime.service.ts`, `packages/core/src/lib/contracts/interfaces/tool-surface.interface.ts`, `packages/core/tests/src/lib/project/tool-surface-runtime.spec.ts`]
- **Gate**: `bunx vitest run --project core -- packages/core/tests/src/lib/project/tool-surface-runtime.spec.ts`

### S2 — `setPluginDisposer` + disposición real + relazy transparente + log observable

- **Status**: done
- **Bug adicional encontrado y corregido en el camino**: `invokeTool`
  reactivaba una tool lazy con
  `this.recordsByRegistrationId.get(record.registrationId) ?? {...record, ...binding, lazyActivate: undefined}`.
  Esa expresión asume que `activate()` siempre actualiza el mapa como
  efecto secundario (cierto para `materializeLazyTool` la PRIMERA vez,
  porque llama `bindRegisteredTool`); pero el activador que
  `rebindPluginAsLazy` retiene para la reactivación POST-eviction es
  ese mismo `activate()` cacheado — en la segunda llamada
  `materializeLazyTool` devuelve el binding cacheado sin volver a
  registrar nada, así que el mapa sigue teniendo el record viejo (sin
  handler) y `record.handler` quedaba `undefined` para siempre tras el
  primer ciclo evict→reactivate. Corregido en
  `packages/core/src/lib/project/tool-surface-runtime.service.ts` para
  preferir el record del mapa sólo cuando es una referencia DISTINTA a
  la de antes de `await activate()` (carrera real); si no cambió, el
  record se reconstruye desde `binding` directamente. Sin este fix,
  `x00286` habría dejado toda tool evictada permanentemente rota tras
  su primera reactivación — cubierto por
  "calls the injected disposer and relazies the plugin..." en el spec
  de abajo, que invoca la tool tras la eviction y comprueba el
  resultado real.
- **Files**: [`packages/core/src/lib/project/tool-surface-runtime.service.ts`, `packages/core/src/lib/contracts/interfaces/tool-surface.interface.ts`]
- **Gate**: `bunx vitest run --project core -- packages/core/tests/src/lib/project/tool-surface-runtime-eviction.spec.ts`

### S3 — property test de la cota `maxWarmPlugins`

- **Status**: done
- **Files**: [`packages/core/tests/src/lib/project/tool-surface-runtime-eviction.property.spec.ts`]
- **Gate**: `bunx vitest run --project core -- packages/core/tests/src/lib/project/tool-surface-runtime-eviction.property.spec.ts`

### S4 — cablear un disposer real por plugin

- **Status**: done
- **Qué se hizo**: `IManagedLazyRuntime` gana `disposePlugin(pluginId)` —
  idempotente, comparte el `Set` `disposedPluginIds` con `disposeAll` (un
  plugin evictado en caliente nunca se vuelve a disposer en el shutdown
  final). `assemble-plugins.ts` expone `disposePlugin` en
  `IAssemblePluginsResult` sólo para la asamblea managed-lazy (los
  plugins eager nunca son evictables — no tienen `bindLazyTool`, así que
  `isPluginEvictable` los excluye siempre); `assemble.ts` lo enruta a
  `IMcpVertexHostConfig.disposePlugin`; `create-mcp-project.ts` lo
  conecta a `toolSurfaceRuntime.setPluginDisposer` justo al lado del
  `setLazyPluginLoader` ya existente.
- **Evidencia del "antes" (verificada, no asumida)**: con el cableado de
  `create-mcp-project.ts` revertido, el nuevo test
  `plugin-disposer-wiring.e2e.spec.ts` falla exactamente como predice el
  hallazgo — `expected "vi.fn()" to be called 1 times, but got 0 times`.
  Con el cableado puesto, el mismo test pasa.
- **Test decisivo**: `plugin-disposer-wiring.e2e.spec.ts` arranca el
  proyecto real (`assembleCliConfig` + `createMcpProject`), fuerza una
  eviction LRU real (`maxWarmPlugins: 1`, dos plugins tocados vía el
  router `mcp-vertex_vertex`), y comprueba que el `dispose()` del propio
  plugin evictado se invocó exactamente una vez — y que invocar su tool
  después sigue funcionando (relazy transparente) sin una segunda
  disposición. No es un fake inyectado directamente en
  `setPluginDisposer` (eso ya lo cubría S2) — pasa por el cableado de
  producción completo.
- **Files**: [`packages/core/src/lib/plugins/managed-lazy-runtime.ts`, `packages/core/src/lib/cli/assemble-plugins.ts`, `packages/core/src/lib/cli/assemble.ts`, `packages/core/src/lib/contracts/interfaces/host-config.interface.ts`, `packages/core/src/lib/project/create-mcp-project.ts`, `packages/core/tests/src/lib/e2e/plugin-disposer-wiring.e2e.spec.ts`]
- **Gate**: `bunx vitest run --project core -- packages/core/tests/src/lib/e2e/plugin-disposer-wiring.e2e.spec.ts` — pasa.

## Dependency graph

Depende de `r00038` (ya en `develop`, commit `58be8f3a`) por la retención
de `dispose` en la ruta lazy — sin ella no habría nada real que conectar a
`setPluginDisposer` en un cableado futuro. No depende de `x00285`.

## Acceptance

1. Con `maxWarmPlugins: 2` y 3 plugins evictables tocados, el tercero
   provoca la disposición del más antiguo — probado con un spy en el
   disposer inyectado vía `setPluginDisposer`.
2. Un plugin evictado se reactiva de forma transparente en la siguiente
   invocación y devuelve el mismo resultado (mismo `handler` lógico,
   reconstruido vía el `lazyActivate` retenido).
3. Un plugin con `inFlightByPlugin > 0` nunca se evicta, ni por TTL ni por
   LRU — regresión cubierta explícitamente para la rama LRU, que antes no
   tenía la guarda.
4. `idleTtlMs: null` desactiva la evicción por tiempo; `maxWarmPlugins: null`
   desactiva la cota LRU — cada uno independientemente.
5. Property test (`fast-check`): para cualquier secuencia de operaciones
   touch/invoke/evict sobre un conjunto de plugins todos evictables y sin
   solapamiento de invocaciones en vuelo, el número de plugins en
   `warmAtByPlugin` nunca excede `maxWarmPlugins`.
6. `project_context.loadedPlugins` dejar de listar un plugin evictado hasta
   que se reactive — el snapshot ahora es honesto en ambos campos
   (`loadedPlugins` y `warmPlugins`), no sólo en el segundo.
7. Se emite una línea de log (`[surface] evicted plugin ...`) por cada
   eviction real — no hay cambio de estado silencioso.

## Risks and mitigations

| Riesgo | Mitigación |
| --- | --- |
| Sin un `pluginDisposer` conectado (caso por defecto hasta que un host lo cablee), la eviction libera el handler pero no memoria real del módulo importado | Documentado como `Non-goals`; el mecanismo no finge haber liberado lo que no puede nombrar — sigue siendo una mejora honesta sobre el estado anterior (que no liberaba NADA, ni siquiera el handler), y deja el punto de extensión listo. |
| Un `dispose()` que lanza podría, en teoría, dejar el plugin en un estado inconsistente | `scheduleDisposal` captura el error, lo loguea, y continúa con `rebindPluginAsLazy` de todas formas — un dispose roto nunca bloquea la relazy ni la disposición de otros plugins (mismo patrón de agregación que `disposeAll` en `r00038`). |
| Un plugin con dependencias (`plugin.dependsOn`) evictado mientras otro plugin activo aún lo necesita | Fuera del alcance verificable en esta capa: `tool-surface-runtime.service.ts` no conoce el grafo de dependencias entre plugins (eso vive en `managed-lazy-runtime.ts`, fuera de territorio). Anotado para la extensión de cableado futura, no bloquea esta propuesta porque hoy ningún plugin gestionado se evictaría sin que su `lazyActivate` original vuelva a resolver la misma cadena de dependencias que la primera vez. |
| Tokens | Reduce el coste de sesiones largas (menos memoria retenida); no cambia el tamaño de ningún `tools/list`. |

## Notes

- El gate `verify:plugin-wiring` que la auditoría sugiere para exigir
  `dispose` idempotente en cada plugin de primera parte no se implementa
  aquí — pertenece al territorio de `managed-lazy-runtime.ts`/`cli/**` y
  queda fuera de esta slice.
