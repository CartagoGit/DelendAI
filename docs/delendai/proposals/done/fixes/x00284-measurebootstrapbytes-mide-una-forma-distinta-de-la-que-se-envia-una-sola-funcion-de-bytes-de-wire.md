---
id: x00284
title: "measureBootstrapBytes mide una forma distinta de la que se envía — una sola función de bytes de wire"
kind: fix
status: done
type: fix
track: tokens
date: 2026-08-27
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-B04
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P2
related: [q00011, x00283]
---

# x00284 — `measureBootstrapBytes` mide una forma distinta de la que se envía

## Goal

Una sola función compartida (`measureToolWireBytes` /
`measureBootstrapBytes` en `packages/core/src/lib/surface/bootstrap.ts`)
serializa exactamente lo que un cliente recibe en `tools/list`
(`{name, description, inputSchema, outputSchema, annotations,
execution}`), y es la única base que usan tanto el gate
`measure-bootstrap` (CI) como `ToolSurfaceRuntime.measureSchemaBytes`.
Un test e2e arranca el CLI compilado real por stdio, captura su
`tools/list` real, y comprueba que la función coincide con ese payload
dentro de ±1%. Un segundo test comprueba que un `outputSchema` que
crece mueve la medición — antes no podía.

## Why

Verificado línea a línea contra `2cf17373`
(`packages/core/src/lib/surface/bootstrap.ts:11-31`):

```ts
export const measureBootstrapBytes = (
	descriptors: readonly IToolSurfaceDescriptor[],
): IBootstrapMeasurement => {
	...
	JSON.stringify(
		bootstrapDescriptors.map((descriptor) => ({
			name: descriptor.name,
			toolId: descriptor.toolId,
			summary: descriptor.summary,
		})),
	),
	...
```

`measureBootstrapBytes` serializaba `{name, toolId, summary}`. La carga
real que un cliente recibe en `tools/list` es
`{name, description, inputSchema, outputSchema, annotations, execution}`
(verificado contra la respuesta real del SDK — ver "Why this design").
Ni `toolId` ni `summary` son campos MCP reales; `inputSchema` y
`outputSchema` — el 75% del coste real de bootstrap según la propia
auditoría — estaban completamente ausentes. El job `measure-bootstrap`
(`.github/workflows/surface-bootstrap.yml`) reporta un número que no
puede moverse cuando el `outputSchema` de una tool crece: una métrica de
"bytes de bootstrap" que no puede ver el 75% del coste que dice medir.

Además del sitio citado por la auditoría había una SEGUNDA
implementación divergente, `ToolSurfaceRuntime.measureSchemaBytes`
(`tool-surface-runtime.service.ts:375-397`, medida real contra
`2cf17373`), que sí incluía `inputSchema`/`outputSchema` pero pasaba la
descripción por `compactDescription` — una función de proyección para
la vista `overview`/`tool_search`, no lo que un `server.registerTool()`
real registra. Ninguna de las dos medía el objeto real.

Una tercera ruta citada por la auditoría, `measureToolTextBytes`
(`tools/scripts/report/token-budget-report-lib.ts:312-320`), mide algo
estructuralmente distinto: los bytes de texto de la RESPUESTA de una
llamada a una tool (`client.callTool(...).content[0].text`), no la
definición de la tool en `tools/list`. Confirmado leyendo su cuerpo —
no comparte forma con las otras dos y no se colapsa aquí (ver
"Non-goals").

## Why this design

**La forma real se verificó empíricamente, no se asumió.** Se instrumentó
un cliente MCP real contra el CLI compilado
(`packages/core/dist/cli.js`) sobre stdio y se inspeccionó
`client.listTools()` byte a byte. Dos hallazgos que cambiaron el diseño
respecto a la lectura ingenua del código del SDK:

- `inputSchema` NUNCA está ausente: el propio SDK
  (`@modelcontextprotocol/sdk/server/mcp.js`,
  `ListToolsRequestSchema` handler) usa un fallback
  `{type:'object',properties:{}}` (`EMPTY_OBJECT_JSON_SCHEMA`) cuando una
  tool no declara schema. Tratar "sin schema" como "0 bytes" habría sido
  exactamente el tipo de subestimación silenciosa que este hallazgo
  denuncia — `measureToolWireBytes` replica el mismo fallback.
- Cada tool registrada vía el overload estándar `server.registerTool(name,
  config, handler)` — el único que usa este repo — lleva SIEMPRE
  `execution: {taskSupport: 'forbidden'}` en el payload real (el SDK lo
  fija por defecto, nunca lo deja `undefined`). Esto no aparece en
  ninguna documentación de alto nivel del SDK; se descubrió comparando
  el payload real contra una primera versión de esta función que
  fallaba la comprobación ±1% por un 1.9% — exactamente ese campo
  ausente explicaba la diferencia completa. Sin verificar contra un
  servidor real, esta función habría quedado con el mismo defecto
  estructural que el hallazgo original: "parece medir lo correcto pero
  no lo hace".

**Una función pura, dos consumidores, cero duplicación.**
`measureToolWireBytes(tool: IMcpToolWireDefinition): number` serializa
un tool; `measureBootstrapBytes(tools): IBootstrapMeasurement` la agrega
sobre un array. `IMcpToolWireDefinition` vive en
`contracts/interfaces/tool-wire.interface.ts` (regla
`lint:types-in-contracts`) precisamente para que sea el contrato
compartido, no un tipo privado de `bootstrap.ts`.
`ToolSurfaceRuntime.measureSchemaBytes` deja de tener su propia
serialización y delega en `measureToolWireBytes`, pasando la
`description` cruda (nunca `compactDescription`) y un `execution`
constante — documentado inline como derivado del mismo default que fija
el SDK, no un valor inventado.

**El job de CI deja de leer bookkeeping estático y arranca un servidor
real.** `IToolSurfaceDescriptor` (el tipo que alimentaba la función
vieja) nunca cargó `inputSchema`/`outputSchema`/`annotations`/
`execution` — no es que la función los ignorara, es que el tipo de
entrada no podía transportarlos. Ampliar ese descriptor para cargar
schemas habría tocado casi todos los sitios que lo construyen
(`assemble-plugins.ts`, `assemble.ts`, core tool registration) para un
beneficio que la arquitectura ideal de la propia auditoría ya nombra:
medir el `tools/list` real. `tools/scripts/measure/bootstrap.script.ts`
ahora arranca `createMcpProject` + `InMemoryTransport`, conecta un
cliente real por cada modo (`native`/`adaptive`/`compact` vía
`--surface=` explícito, que fija el modo sin depender de negociación de
capacidades) y mide el `tools/list` real recibido — la garantía más
fuerte posible sin tocar el propio SDK.

## Non-goals

- `measureToolTextBytes` (`tools/scripts/report/token-budget-report-lib.ts`)
  NO se colapsa en `measureToolWireBytes`: mide la respuesta de una
  llamada a una tool (`CallToolResult.content[0].text`), un payload
  estructuralmente distinto de una *definición* de tool en `tools/list`.
  Forzar una función compartida entre ambos habría sido la unificación
  equivocada — mismo nombre ("bytes"), objetos distintos.
- No se toca `tools/scripts/report/token-budget-dashboard.script.ts`,
  `tools/scripts/test/run-token-dashboard-check.script.ts`,
  `tools/scripts/test/run-actual-preset-budget.script.ts`,
  `packages/core/src/lib/contracts/constants/token-budgets.constant.ts`,
  `packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts` ni
  `docs/mcp-vertex/TOKEN-BUDGETS.md` — territorio de otro agente activo
  en la misma sesión de `q00011` (ver `x00283`/`r00036`). La
  "arquitectura ideal" de la auditoría menciona el dashboard como tercer
  consumidor de la función compartida; queda como seguimiento explícito,
  no ejecutado aquí, para evitar colisión.
- No se corrige `estimateDescriptorBytes`
  (`packages/core/src/lib/startup-report/plugin-cost.ts:109-121`), una
  CUARTA implementación divergente (mismo `{name+toolId+summary}` que la
  función vieja) que la auditoría no nombró explícitamente y que cae
  fuera del territorio asignado a esta propuesta
  (`startup-report/` no está en el territorio de S4/x00284). Queda
  anotado en risks and mitigations.
- No se cambia el contrato de `IToolSurfaceDescriptor` — sigue sin
  cargar schemas; el job de CI obtiene el payload real por conexión en
  vivo en vez de ampliar ese tipo.

## Architecture

```
contracts/interfaces/tool-wire.interface.ts
 └── IMcpToolWireDefinition { name, description?, inputSchema?,
                              outputSchema?, annotations?, execution? }
        el contrato compartido — mismo shape en los dos consumidores.

surface/bootstrap.ts
 ├── measureToolWireBytes(tool): number
 │      la ÚNICA serialización — name siempre, inputSchema con fallback
 │      SDK ({type:'object',properties:{}}), description/outputSchema/
 │      annotations/execution sólo si están definidos (igual que
 │      JSON.stringify sobre un tools/list real).
 └── measureBootstrapBytes(tools): IBootstrapMeasurement
        suma measureToolWireBytes sobre un array ya en forma de
        tools/list real — ya no filtra por BOOTSTRAP_CORE_TOOL_IDS
        internamente; el llamante decide qué conjunto medir pasando el
        tools/list que corresponda.

project/tool-surface-runtime.service.ts
 └── measureSchemaBytes(mode): Record<registrationId, bytes>
        por cada record visible en `mode`, llama a measureToolWireBytes
        con record.description CRUDO (ya no compactDescription) +
        execution: {taskSupport:'forbidden'} (constante — deriva del
        default real del SDK para server.registerTool, documentado
        inline).

tools/scripts/measure/bootstrap.script.ts  (CI job)
 └── por cada modo (native/adaptive/compact):
        assembleCliConfig + createMcpProject + InMemoryTransport
        → client.listTools() real
        → measureBootstrapBytes(tools reales, incluyendo execution)
        → falla si adaptive > 50 KB (gate sin cambios de umbral)
```

## Slices

### S1 — `IMcpToolWireDefinition` + `measureToolWireBytes` compartida

- **Status**: done
- **Files**: [`packages/core/src/lib/contracts/interfaces/tool-wire.interface.ts`, `packages/core/src/lib/surface/bootstrap.ts`, `packages/core/src/public/index.ts`]
- **Gate**: `bunx vitest run --project core -- packages/core/tests/src/lib/surface/bootstrap.spec.ts`

### S2 — `ToolSurfaceRuntime.measureSchemaBytes` delega en la función compartida

- **Status**: done
- **Nota**: cambia el comportamiento observable — la descripción ya no
  se trunca vía `compactDescription`, y se añade `execution` constante.
  Ningún test existente verificaba el valor exacto de bytes (sólo
  `> 0` e igualdad entre modos), así que no hubo regresión que corregir.
- **Files**: [`packages/core/src/lib/project/tool-surface-runtime.service.ts`]
- **Gate**: `bunx vitest run --project core -- packages/core/tests/src/lib/project/tool-surface-runtime.spec.ts`

### S3 — el gate `measure-bootstrap` mide un `tools/list` real por conexión en vivo

- **Status**: done
- **Files**: [`tools/scripts/measure/bootstrap.script.ts`]
- **Gate**: `bun tools/scripts/measure/bootstrap.script.ts` (requiere `bun run build` previo — usa `packages/core/dist/cli.js` indirectamente vía `createMcpProject` en proceso, no por stdio)

### S4 — test decisivo: stdio real ±1%, y sensibilidad a `outputSchema` creciente

- **Status**: done
- **Files**: [`packages/core/tests/src/lib/e2e/bootstrap-wire-bytes.e2e.spec.ts`, `packages/core/tests/src/lib/surface/bootstrap.spec.ts`]
- **Gate**: `bunx vitest run --project core -- packages/core/tests/src/lib/e2e/bootstrap-wire-bytes.e2e.spec.ts` (skip automático si `packages/core/dist/cli.js` no existe — requiere `bun run build` primero, igual que `tools/scripts/smoke/cli.script.ts`)

## Dependency graph

Independiente de `x00283`/`r00036` (ambos tocan medición de tokens pero
archivos disjuntos — ver Non-goals). No depende de `x00286`.

## Acceptance

1. `measureToolWireBytes` y `measureBootstrapBytes` son la única
   implementación de "bytes de wire" en `packages/core/src/lib/surface/` y
   en `ToolSurfaceRuntime` — cero duplicación entre ambos consumidores.
2. Test e2e (`bootstrap-wire-bytes.e2e.spec.ts`): arranca
   `packages/core/dist/cli.js` real por stdio, captura `tools/list`
   real, y `measureBootstrapBytes(tools reales).bytes` coincide con una
   re-serialización independiente del mismo payload dentro de ±1%.
3. Test unitario (`bootstrap.spec.ts`): un `outputSchema` que crece
   (de un `properties` pequeño a uno con objetos anidados) aumenta la
   medición — antes de esta propuesta el campo era invisible y el delta
   habría sido siempre 0.
4. `bun tools/scripts/measure/bootstrap.script.ts` sigue fallando con
   exit 1 si `adaptive` supera 50 KB (comportamiento del gate sin
   cambios), pero ahora sobre bytes reales en vez de una proyección.

## Risks and mitigations

| Riesgo | Mitigación |
| --- | --- |
| `estimateDescriptorBytes` en `startup-report/plugin-cost.ts` queda como una CUARTA implementación divergente, no nombrada por la auditoría y fuera del territorio de esta propuesta | Documentado explícitamente en Non-goals; mismo defecto estructural (`{name,toolId,summary}`), candidato directo para una propuesta de seguimiento cuando `startup-report/` esté en territorio abierto. |
| El job de CI ahora arranca un servidor real por modo en vez de leer bookkeeping estático — más lento y con más superficie de fallo (import de plugins, timeouts) | Cada conexión se cierra (`client.close()` + `project.dispose()` + `server.close()`) en un `finally`; el coste medido en este repo es de cientos de ms por modo, aceptable para un job de CI que ya hace un checkout completo. |
| El test decisivo depende de `packages/core/dist/cli.js` ya compilado | `describe.skipIf(!existsSync(CLI))` — se salta limpiamente si no se corrió `bun run build`, igual que el precedente `tools/scripts/smoke/cli.script.ts`; no rompe `bunx vitest run --project core` en un entorno sin build. |
| `execution: {taskSupport:'forbidden'}` hardcodeado en `measureSchemaBytes` deja de ser cierto si algún tool de este repo empieza a usar `registerToolTask` (soporte de tareas) | No hay ningún uso de `registerToolTask` hoy (grep verificado); si se introduce, el registro real seguiría siendo la fuente de verdad para el gate de stdio (S3/S4), que no depende de esta constante — sólo `measureSchemaBytes`, una estimación de startup-report, quedaría desactualizada para esa tool concreta. |
| Tokens | Ninguno directo — mejora de medición, no de comportamiento del servidor. |

## Notes

- La discrepancia real medida ANTES de esta propuesta: en modo
  `adaptive`, la función vieja reportaba 1,232 B; el `tools/list` real
  del mismo modo pesa 8,687 B — la métrica vieja subestimaba el
  bootstrap real en aproximadamente un 86% (medía ~14% del valor real).
- `measureBootstrapBytes` cambia de firma (de
  `readonly IToolSurfaceDescriptor[]` a
  `readonly IMcpToolWireDefinition[]`) — el único llamante interno
  (`tools/scripts/measure/bootstrap.script.ts`) se actualizó en la misma
  propuesta; no se detectaron otros llamantes fuera de tests.
