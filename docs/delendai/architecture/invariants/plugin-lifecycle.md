# Invariants — plugin lifecycle

> Part of `d00015` (AUD-G05): invariants that used to live only in the
> author's head. Each one below has a test that fails if it breaks.

## Invariante: `register` ocurre exactamente una vez por plugin

**Estado actual**: CIERTO.

**Test que lo vigila**:
`packages/core/tests/src/lib/plugins/lifecycle-invariants.spec.ts`
(nuevo, d00015 S1) — complementa la cobertura existente en
`register-cancel-dispose.spec.ts` y `load-plugins.spec.ts`.

**Por qué importa**: un `register()` re-invocado silenciosamente (por
ejemplo, un retry mal aislado, o dos rutas de activación que no
comparten estado) duplicaría listeners, timers o handles de recursos.

## Invariante: `dispose` ocurre como máximo una vez por plugin

**Estado actual**: CIERTO.

**Test que lo vigila**:
`packages/core/tests/src/lib/plugins/lifecycle-invariants.spec.ts`
(nuevo, d00015 S1) — complementa `register-cancel-dispose.spec.ts`.

**Por qué importa**: un `dispose()` doble puede cerrar un recurso ya
liberado (doble-free lógico) o lanzar sobre un handle inválido durante
el shutdown, justo el momento en que un fallo es más difícil de
diagnosticar.

## Invariante: eager y lazy tienen semántica idéntica

**Estado actual**: CIERTO — corregido por `r00038`
(`PluginActivationSession`, una sola ruta de activación para ambos
modos). **Era FALSO en la auditoría** (`AUD-E01`): la ruta lazy no
aplicaba `optionsSchema` (defaults/coerción/transforms), no respetaba
`registerTimeoutMs`, y no garantizaba dispose idempotente — un plugin
se comportaba de forma distinta según qué ruta de activación lo
cargara, sin que nada lo advirtiera.

**Test que lo vigila**:
`packages/core/tests/src/lib/plugins/plugin-activation-equivalence.spec.ts`
(test de equivalencia parametrizado, `t00029`, corre el mismo caso por
ambas rutas y compara el resultado) +
`packages/core/tests/src/lib/plugins/managed-lazy-runtime.spec.ts`.

## Invariante: timeout y `AbortSignal` funcionan en ambas rutas

**Estado actual**: CIERTO — misma corrección que el invariante
anterior (`r00038`). Antes, sólo la ruta eager respetaba
`registerTimeoutMs`.

**Test que lo vigila**:
`packages/core/tests/src/lib/plugins/plugin-activation-equivalence.spec.ts`
(caso `AUD-E01.b`, "applies registerTimeoutMs to a register() that
never resolves").

## Invariante: un fallo parcial revierte en orden inverso de registro

**Estado actual**: CIERTO.

**Test que lo vigila**:
`packages/core/tests/src/lib/plugins/lifecycle.spec.ts` y
`packages/core/tests/src/lib/plugins/register-cancel-dispose.spec.ts`.
`r00039` (`McpHostSession.dispose`) generalizó esta garantía al
teardown completo de la sesión, no sólo a la carga de plugins.
