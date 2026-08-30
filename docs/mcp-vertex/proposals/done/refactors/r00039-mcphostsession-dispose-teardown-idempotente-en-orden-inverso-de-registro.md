---
id: r00039
title: "McpHostSession.dispose(): teardown idempotente en orden inverso de registro"
kind: refactor
status: done
type: refactor
track: lifecycle
date: 2026-08-27
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-E02
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P0
related: [q00011, r00038, x00291]
---

# r00039 — `McpHostSession.dispose()`: nadie es dueño del teardown

## Goal

`createMcpProject()` gana un `dispose()` idempotente que cierra cada
runtime de plugin que el host activó (eager o lazy, la que se haya usado)
en orden inverso de activación, agregando errores por plugin sin que uno
roto impida disponer al resto, y drenando invocaciones en vuelo antes de
disponer. `runCli()` ata `SIGTERM`/`SIGINT` a esa disposición.

## Why

Verificado contra `2cf17373`: la ruta eager retiene `dispose` por plugin
(`ILoadedPlugin.runtime.dispose`), pero `createMcpProject()` expone
únicamente `{ server, registrationOrder, start }` — no hay ningún `dispose`
que el host pueda llamar. Combinado con `AUD-E01.c` (lazy ni siquiera
retiene `dispose`, arreglado en `r00038`) y `AUD-D05` (`external-mcps` ni
siquiera lo devolvía, arreglado en `x00291`), la cadena estaba rota en los
TRES niveles a la vez: el plugin no exponía, el activador no retenía, el
host no llamaba. Arreglar sólo uno de los tres no habría producido ninguna
mejora observable — de ahí que las tres propuestas vayan en el mismo tramo
del plan (`S2`).

## Non-goals

- No se implementa el `McpHostSession` de la "arquitectura ideal" del
  informe como una clase nueva que envuelva `server`/`transports`/
  `PluginActivationManager` — sería una reestructuración mayor de
  `create-mcp-project.ts` y `assemble.ts` sin beneficio adicional sobre
  añadir `dispose()` al objeto que `createMcpProject()` ya devuelve. Si en
  el futuro se necesita más superficie de sesión, este `dispose()` es el
  punto de partida natural.
- No se reemplaza `gracefulShutdown` (cierre del transporte + `process.exit`)
  — se compone con él: `dispose()` cierra los plugins, `gracefulShutdown`
  cierra el transporte y sale.
- No se implementa un `try/finally` literal alrededor de `assembled.start()`
  en `runCli()`: `start()` resuelve en cuanto el transporte conecta, no
  cuando el servidor se cierra eventualmente — un `finally` ahí dispondría
  los plugins inmediatamente después de arrancar. La disposición se ata a
  las señales de proceso en su lugar.

## Architecture

```
IMcpVertexProject {
  server, registrationOrder, start(),
  dispose()   // NUEVO: idempotente
}

config.disposePlugins()  // NUEVO en IHostRegistrations, agregado por
                          // assemble-plugins.ts a partir de:
                          //  - eager: disposeLoadedPlugins(loadResult.loaded)
                          //  - lazy:  lazyRuntime.disposeAll()
                          // envuelto en un guard de idempotencia
                          // (idempotentDisposePlugins) en cualquiera de
                          // los dos casos.

runCli(): al recibir SIGTERM/SIGINT →
  assembled.dispose() → gracefulShutdown(assembled.server, {exitCode})
```

`dispose()` espera (acotado a 5s) a que
`toolSurfaceRuntime.hasInFlightWork()` sea `false` antes de llamar a
`config.disposePlugins()`, para no cortar una invocación lazy en vuelo.

## Slices

### S1 — `disposePlugins` en `assemble-plugins.ts` (eager + lazy)

- **Status**: done
- **Files**: [`packages/core/src/lib/cli/assemble-plugins.ts`, `packages/core/src/lib/plugins/managed-lazy-runtime.ts`]
- **Gate**: `bunx vitest run --project core -- packages/core/tests/src/lib/plugins/managed-lazy-runtime.spec.ts`

### S2 — `IHostRegistrations.disposePlugins` + `createMcpProject().dispose()`

- **Status**: done
- **Files**: [`packages/core/src/lib/contracts/interfaces/host-config.interface.ts`, `packages/core/src/lib/contracts/interfaces/tool-surface.interface.ts`, `packages/core/src/lib/project/create-mcp-project.ts`, `packages/core/src/lib/project/tool-surface-runtime.service.ts`, `packages/core/src/lib/cli/assemble.ts`]
- **Gate**: `bunx vitest run --project core -- packages/core/tests/src/lib/project/create-mcp-project-dispose.spec.ts`

### S3 — `runCli()` ata `SIGTERM`/`SIGINT` a `dispose()`

- **Status**: done
- **Files**: [`packages/core/src/lib/cli/run-cli.ts`]
- **Gate**: `bunx vitest run --project core -- packages/core/tests/src/lib/cli`

## Dependency graph

Depende de `r00038` (la ruta lazy debe retener `dispose` para tener algo
que agregar) y de `x00291` (`external-mcps` debe devolver `dispose` para
que sus subprocesos entren en el barrido).

## Acceptance

1. `dispose()` llama a `config.disposePlugins()` exactamente una vez; una
   segunda llamada es un no-op verificado por test.
2. Un plugin cuyo `dispose` lanza no impide el de los demás — el error se
   agrega y se reporta, `dispose()` del host nunca lanza.
3. `dispose()` es seguro de llamar incluso si `start()` nunca se invocó.
4. `SIGTERM`/`SIGINT` en `runCli()` disponen los plugins antes de cerrar el
   transporte.

## Risks and mitigations

| Riesgo | Mitigación |
| --- | --- |
| `hasInFlightWork()` nunca baja a cero (invocación wedged) y `dispose()` se cuelga | Ventana acotada a 5s (`DISPOSE_DRAIN_TIMEOUT_MS`); pasado ese tiempo se dispone igualmente |
| El wiring de `SIGTERM`/`SIGINT` en `run-cli.ts` duplica el de `scripts/host-server.ts`/`tools/scripts/host/host-server.script.ts` | Son entrypoints distintos (`runCli` es el bin `mcp-vertex`; `host-server.script.ts` es el entrypoint de este propio repo) — cada uno gestiona sus propias señales sobre su propio `assembled`, no hay listeners compartidos |

## Notes

No se implementó la "arquitectura ideal" completa (`McpHostSession` como
clase con `PluginActivationManager`/`Telemetry` explícitos) — ver
Non-goals. `dispose()` cubre el contrato observable (AUD-E02's criterios de
aceptación) sin la reestructuración de superficie pública que exigiría
tocar `assemble.ts` mucho más extensamente.
