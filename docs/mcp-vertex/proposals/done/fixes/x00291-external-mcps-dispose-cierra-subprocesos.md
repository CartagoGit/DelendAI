---
id: x00291
title: "external-mcps: register() devuelve dispose() que cierra todo subproceso"
kind: fix
status: done
type: fix
track: security
date: 2026-08-27
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-D05
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P0
related: [q00011, r00038, r00039]
---

# x00291 — `external-mcps` devuelve `dispose()` que cierra todo subproceso

## Goal

Hacer que `register()` de `external-mcps` devuelva un `dispose` que llame a
`ExternalServerRegistry.closeAll()`, para que el proceso que este plugin
arranca no sobreviva al cierre del servidor MCP.

## Why

`ExternalServerRegistry.closeAll()` existe (`server-registry.ts:524`) y
cierra cada subproceso cacheado (SIGTERM, SIGKILL tras el grace period,
idempotente). Pero `plugins/external-mcps/src/index.ts`'s `register()`
devolvía `{ activation, tools }` sin ningún `dispose`:
`grep -n "dispose" plugins/external-mcps/src/index.ts` no devolvía ninguna
línea contra `2cf17373`.

Los servidores que este plugin arranca son procesos de TERCEROS, con sus
propios sockets y ficheros abiertos. Que sobrevivan al cierre del servidor
MCP es la fuga de recursos de mayor impacto del repo — se acumulan en
sesiones largas y en cada `server restart` desde la extensión VS Code (un
comando que ya existe). Es específica de este plugin: aunque `r00038` y
`r00039` cierren el resto de la cadena, sin este `dispose` no hay a quién
llamar.

## Non-goals

- No se implementa la exigencia de manifest ("todo plugin con capability
  `process` DEBE devolver `dispose`, verificado por
  `verify:plugin-wiring`") que el informe propone como solución
  arquitectónica ideal — es una regla de alcance repo-wide, no específica
  de este plugin; queda fuera de `q00011` S2.
- No se cambia el comportamiento de `ExternalServerRegistry.closeAll()` en
  sí (SIGTERM/SIGKILL/grace period) — ya está correctamente implementado y
  probado en `server-registry.spec.ts`.

## Architecture

La solución mínima del informe (`return { tools, activation, dispose }`
plano) pierde `dispose` por el mismo motivo que `managed-lazy-runtime.ts`
lo perdía en AUD-E01.c: el loader identifica un `IPluginRuntime` por la
presencia de la clave `registrations`
(`normalizePluginRuntimeInternal`/`isPluginRuntime`); un objeto plano con
`tools`/`activation`/`dispose` al mismo nivel se trata como
`IMcpPluginRegistrations` puro y el `dispose` se descarta. La forma
correcta — y la que ya usa `commit-policy`, el plugin que el informe cita
como referencia de ciclo de vida — es:

```ts
return {
	registrations: { activation, tools },
	dispose: async () => registry.closeAll(),
};
```

## Slices

### S1 — envolver el registro bajo `registrations` y añadir `dispose`

- **Status**: done
- **Files**: [`plugins/external-mcps/src/index.ts`]
- **Gate**: `bunx vitest run --project external-mcps`

### S2 — actualizar los specs que leían el registro crudo sin desenvolver

- **Status**: done
- **Files**: [`plugins/external-mcps/tests/src/lib/catalog.spec.ts`, `plugins/external-mcps/tests/src/lib/plugin-composition.spec.ts`, `plugins/external-mcps/tests/src/lib/configuration-metadata.spec.ts`]
- **Gate**: `bunx vitest run --project external-mcps`

### S3 — spec dedicado al wiring plugin → registry

- **Status**: done
- **Files**: [`plugins/external-mcps/tests/src/lib/dispose.spec.ts`]
- **Gate**: `bunx vitest run --project external-mcps -- tests/src/lib/dispose.spec.ts`

## Dependency graph

Ninguna para el fix en sí. Se potencia con `r00039`: sin el `dispose` del
host llamando a este, el `dispose` del plugin nunca se invoca en
producción.

## Acceptance

1. `grep -n "dispose" plugins/external-mcps/src/index.ts` devuelve al
   menos una línea.
2. `register()` devuelve una función `dispose` invocable, verificado por
   `dispose.spec.ts`.
3. `dispose()` es seguro de llamar dos veces (idempotencia heredada de
   `ExternalServerRegistry.closeAll()`, ya probada en
   `server-registry.spec.ts`'s "close semantics").
4. `bunx vitest run --project external-mcps` en verde (111 → 113 tests: 2
   nuevos en `dispose.spec.ts`; 4 specs existentes actualizados sin perder
   cobertura).

## Risks and mitigations

| Riesgo | Mitigación |
| --- | --- |
| Cambiar la forma de retorno de `register()` (de plana a `{registrations, dispose}`) rompe a quien llame a `plugin.register()` directamente sin pasar por el loader | Los tres specs de este mismo paquete que lo hacían se actualizaron en la misma propuesta (S2), siguiendo el mismo patrón `asRuntime`/desenvolver que ya usa `commit-policy/tests/src/lifecycle.spec.ts` |
| `closeAll()` deja de ser idempotente en el futuro y el plugin no lo nota | `dispose.spec.ts` prueba explícitamente la doble llamada a nivel del plugin, no sólo a nivel del registry |

## Notes

Ideal a más largo plazo (fuera de esta propuesta): que el manifest de
plugin exija `dispose` cuando declare la capability `process`, verificado
por `verify:plugin-wiring` — ver Non-goals.
