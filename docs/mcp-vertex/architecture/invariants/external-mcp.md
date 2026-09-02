# Invariants — external MCP

> Part of `d00015` (AUD-G05): invariants that used to live only in the
> author's head. Each one below has a test that fails if it breaks.

## Invariante: todo proceso tiene propietario

**Estado actual**: CIERTO — corregido por `x00291`
(`external-mcps` `register()` ahora devuelve un `dispose` que cierra
todo subproceso que lanzó). **Era FALSO en la auditoría** (`AUD-D05`):
un subproceso lanzado por `external-mcps` podía sobrevivir al
`dispose()` del plugin que lo creó, quedando huérfano.

**Test que lo vigila**:
`plugins/external-mcps/tests/src/lib/dispose.spec.ts`.

## Invariante: todo propietario tiene teardown

**Estado actual**: CIERTO — corregido por `r00039`
(`McpHostSession.dispose`, teardown idempotente en orden inverso de
registro). **Era FALSO en la auditoría** (`AUD-E02`): existían
propietarios (sesiones, runtimes lazy) sin una ruta de teardown
garantizada, o con una ruta que no era idempotente ante una segunda
llamada.

**Test que lo vigila**:
`packages/core/tests/src/lib/project/create-mcp-project-dispose.spec.ts`
y `packages/core/tests/src/lib/plugins/managed-lazy-runtime.spec.ts`.

## Invariante: toda ejecución tiene timeout

**Estado actual**: CIERTO.

**Test que lo vigila**:
`plugins/external-mcps/tests/src/lib/discover-gate.spec.ts` y
`plugins/external-mcps/tests/src/lib/server-registry.spec.ts`.

## Invariante: la autonomía del modelo se aplica de verdad

**Estado actual**: CIERTO — corregido por `x00290`
(`llmDecidesActivation` pasa a la política real de activación) y
`x00289` (`eager` pasa a ser expresable en `ServerEntrySchema`).
**Era FALSO en la auditoría** (`AUD-D04`): la opción que declaraba
"el modelo decide cuándo activar este servidor" no estaba conectada a
ninguna política de activación real.

**Test que lo vigila**:
`plugins/external-mcps/tests/src/lib/plugin-composition.spec.ts` y
`plugins/external-mcps/tests/src/lib/configuration-metadata.spec.ts`.
