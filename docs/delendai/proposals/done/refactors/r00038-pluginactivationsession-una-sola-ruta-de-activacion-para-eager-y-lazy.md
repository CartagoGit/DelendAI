---
id: r00038
title: "PluginActivationSession — una sola ruta de activación para eager y lazy"
kind: refactor
status: done
type: refactor
track: lifecycle
date: 2026-08-27
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-E01
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P0
related: [q00011, t00029, r00039, x00291]
---

# r00038 — `PluginActivationSession`: una sola ruta de activación para eager y lazy

## Goal

Eliminar la divergencia entre la activación *eager* (`load-plugins.ts`) y la
activación *managed-lazy* (`managed-lazy-runtime.ts`) haciendo que ambas
pasen por la MISMA primitiva de activación: opciones siempre parseadas vía
`optionsSchema.safeParse(...).data`, `register()` siempre bajo
`registerTimeoutMs` + `AbortSignal`, y el `dispose()` que el plugin
devuelve siempre retenido.

## Why

Verificado línea a línea contra `2cf17373`:

- **E01.a** — `load-plugins.ts:299-315` usa `parsed.data`; `managed-lazy-runtime.ts:180-187`
  sólo comprueba `.success` y llama a `plugin.register(context)` con el
  `context.options` SIN parsear. `.default()`, `.coerce`, `.transform()` y
  `.preprocess()` de Zod se aplican en eager y no en lazy.
- **E01.b** — eager pasa por `registerResolvedPluginsWithLifecycle` →
  `registerPluginWithLifecycle`, que aplica `timeoutMs` + `AbortController`
  (`load-plugins-runtime.helper.ts:141`). Lazy hace `await
  plugin.register(context)` desnudo: un `register()` que no resuelve cuelga
  la invocación del usuario que disparó la activación perezosa.
- **E01.c** — `managed-lazy-runtime.ts:188-213` extrae `registrationPayload(registered)`
  y descarta cualquier `dispose` que el plugin haya devuelto junto a sus
  registrations.

El modo `managed` (lazy) es el default silencioso y la pieza que produce
los 8.934 B de bootstrap frente a 283.919 B nativos — es decir, es la ruta
por la que pasan MÁS plugins, y es la que tiene las tres garantías de ciclo
de vida degradadas.

## Non-goals

- No reescribir `load-plugins.ts` ni `managed-lazy-runtime.ts` desde cero:
  ambos ficheros tienen semántica de fases (resolve → dependency graph →
  register) y de cache-por-plugin-id que sigue siendo correcta; sólo el
  punto de activación por-plugin se unifica.
- No cambiar la clasificación de errores de fase (`dependency` vs
  `register`) del loader eager — un cambio ahí es riesgo de romper tests
  existentes sin beneficio para AUD-E01.
- No añadir un `AbortSignal` externo nuevo a la ruta lazy desde la CLI —
  eso no es parte de la divergencia denunciada; hoy ninguna de las dos
  rutas recibe una señal externa real desde `assemble-plugins.ts`, así que
  no hay regresión de paridad al dejarlo fuera de esta propuesta.

## Architecture

```
PluginActivationSession (plugin-activation-session.ts)
 ├── normalizePluginOptions(plugin, ctx)   // safeParse → parsed.data, siempre
 └── activatePluginSession({plugin, ctx, timeoutMs, signal})
      └── registerPluginWithLifecycle(...)  // YA existía y ya era correcto:
                                             // timeout + AbortSignal + retiene
                                             // dispose vía
                                             // normalizePluginRuntimeInternal
```

`registerPluginWithLifecycle` (`load-plugins-runtime.helper.ts`) ya
implementaba correctamente el contrato timeout/AbortSignal/retención-de-
dispose para la ruta eager. La solución NO es una tercera implementación:
es hacer que la ruta lazy pase por la misma función en vez de reimplementar
su propio `plugin.register(context)` desnudo. `normalizePluginOptions` es
la única función que llama a `optionsSchema.safeParse`, usada tanto por la
fase de resolución de `load-plugins.ts` como por `activatePluginSession`.

## Slices

### S1 — extraer `normalizePluginOptions` y `activatePluginSession`

- **Status**: done
- **Files**: [`packages/core/src/lib/plugins/plugin-activation-session.ts`, `packages/core/src/lib/contracts/interfaces/plugin-activation-session.interface.ts`]
- **Gate**: `bunx vitest run --project core -- packages/core/tests/src/lib/plugins/plugin-activation-equivalence.spec.ts`

### S2 — `load-plugins.ts` usa `normalizePluginOptions` en vez de su lógica inline

- **Status**: done
- **Files**: [`packages/core/src/lib/plugins/load-plugins.ts`]
- **Gate**: `bunx vitest run --project core -- packages/core/tests/src/lib/plugins/load-plugins.spec.ts packages/core/tests/src/lib/plugins/register-cancel-dispose.spec.ts`

### S3 — `managed-lazy-runtime.ts` usa `activatePluginSession` y retiene `dispose`

- **Status**: done
- **Files**: [`packages/core/src/lib/plugins/managed-lazy-runtime.ts`]
- **Gate**: `bunx vitest run --project core -- packages/core/tests/src/lib/plugins/managed-lazy-runtime.spec.ts packages/core/tests/src/lib/plugins/plugin-activation-equivalence.spec.ts`

## Dependency graph

Ninguna. Habilita `r00039` (teardown del host) y `x00291` (dispose de
`external-mcps`) — ambos necesitan que la ruta lazy retenga `dispose` para
tener a quién llamar.

## Acceptance

1. El test de equivalencia parametrizado (`t00029`) pasa para AMBAS rutas
   sin ramas condicionales por ruta.
2. `managed-lazy-runtime.ts` ya no contiene su propia lógica de
   opciones/timeout/dispose — delega en `plugin-activation-session.ts`.
3. Un `register()` que no resuelve produce, en ambas rutas, un error
   estructurado tras `registerTimeoutMs`; una resolución tardía no activa
   el plugin y su `dispose` (si lo hay) se llama igualmente.
4. `dispose` se retiene en la ruta lazy y se puede invocar a través de
   `IManagedLazyRuntime.disposeAll()` (ver `r00039`).

## Risks and mitigations

| Riesgo | Mitigación |
| --- | --- |
| Un plugin lazy que dependía (por accidente) de recibir `ctx.options` SIN parsear deja de funcionar | Es el comportamiento que AUD-E01.a documenta como bug, no como contrato; ningún plugin de primera parte depende de options sin parsear (ninguno declara `optionsSchema` con reglas que difieran de identidad salvo los que ya funcionan correctamente vía eager) |
| Aplicar timeout a un `register()` lazy que antes no tenía límite puede romper un plugin lento | `registerTimeoutMs` por defecto es 15000ms, igual que el default eager — un plugin que tardaba más ya fallaba de forma equivalente si se cargaba eager |

## Notes

- `registerPluginWithLifecycle` ya gestionaba correctamente la resolución
  tardía de un `register()` que perdió la carrera del timeout: dispone el
  runtime resultante sin activarlo nunca. La ruta lazy hereda esa garantía
  gratis al delegar en la misma función.
