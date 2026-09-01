---
id: x00285
title: "decideSurfaceModeFromCapabilities lee al cliente en vez de ignorarlo"
kind: fix
status: done
type: fix
track: adaptive-surface
date: 2026-08-27
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-C01
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P1
related: [q00011, x00286]
---

# x00285 — `decideSurfaceModeFromCapabilities` lee al cliente en vez de ignorarlo

## Goal

Hacer que `decideSurfaceModeFromCapabilities` (`packages/core/src/lib/surface/decide-mode.ts`)
use realmente `clientInfo` y `capabilities` cuando no hay `explicitMode`: un
host conocido recibe el modo que el `host-compatibility-matrix.md` ya le
asigna; un host desconocido que no declara soporte de notificaciones de
lista de tools cae a `native` en vez de a `managed` por defecto silencioso.
`shouldRegisterSurfaceRouter` deja de ser una constante y lee su parámetro.
El `reason` resultante se propaga al Startup Report para que el operador
pueda ver por qué está en el modo en el que está.

## Why

Verificado línea a línea contra `2cf17373`
(`packages/core/src/lib/surface/decide-mode.ts:30-45`):

```ts
export const decideSurfaceModeFromCapabilities = (input: {
	clientInfo?: Implementation | undefined;
	capabilities?: ClientCapabilities | undefined;
	explicitMode?: IMcpToolSurfaceMode | undefined;
}): ISurfaceModeDecision => {
	if (input.explicitMode !== undefined) { /* ... */ }
	return { mode: 'managed', reason: '...' };
};
```

Sin `explicitMode`, la función siempre devuelve `'managed'` sin mirar
`clientInfo` ni `capabilities` — los dos parámetros que le dan nombre. En la
misma línea, `shouldRegisterSurfaceRouter(_explicitMode)` ignora su
argumento (nombrado con `_` precisamente porque nunca se lee) y devuelve
`true` incondicionalmente.

El nombre y la firma de ambas funciones prometen adaptación por cliente; el
cuerpo es una constante. Un host que no soporta
`notifications/tools/list_changed` recibe la misma superficie gestionada
que uno que sí la soporta — y para el primero `managed` es activamente
peor: nunca verá aparecer las tools que se activen salvo que adivine el
`vertex` router (6 tools visibles y ninguna forma de descubrir el resto).

## Why this design

**El literal de la auditoría no es aplicable tal cual.** `ClientCapabilities`
del SDK (`node_modules/.bun/@modelcontextprotocol+sdk@1.30.0/.../types.d.ts:572-579`)
no tiene una propiedad `tools` en absoluto — sólo `experimental`, `sampling`,
`elicitation`, `roots`, `tasks`, `extensions`. `tools.listChanged` es una
capacidad de **servidor**, no de cliente; el protocolo no define una señal
estándar de "el cliente sabe reaccionar a `notifications/tools/list_changed`".
Leer `capabilities.tools?.listChanged` literalmente siempre sería
`undefined` para cualquier cliente real, lo que volcaría el default a
`native` para el 100% de las conexiones — la inversión exactamente opuesta
al comportamiento actual, sin relación con el soporte real del host.

El repo ya resolvió este problema de señal antes de esta auditoría:
`packages/core/src/lib/surface/client-capabilities.ts`
(`detectClientSurfaceCapabilities`) define la extensión propietaria
`mcp-vertex/surface` (`capabilities.extensions['mcp-vertex/surface']` o su
equivalente en `experimental`) con un campo `toolsListChanged: boolean`, y
ya la usan los tests e2e existentes
(`packages/core/tests/src/lib/e2e/tool-surface.e2e.spec.ts`). Esta propuesta
usa esa función ya construida — hasta ahora nunca conectada a
`decide-mode.ts` — como la señal real equivalente a la que el hallazgo
describe.

**Tensión con ADR-0017 documentada explícitamente, no oculta.**
`docs/mcp-vertex/host-compatibility-matrix.md` documenta una decisión
posterior y deliberada (`r00026`, "flip default"): TODOS los hosts,
incluido "Plain MCP client (any spec-compliant host)", reciben `managed`
por defecto, precisamente para no depender de detección de capacidades —
el `vertex` router más el tool `mcp-vertex_vertex` bridgean cualquier
cliente que nunca refresque `tools/list` (ver el e2e "a client that never
refreshes tools/list can still reach an activated tool"). Esa arquitectura
funciona y está probada.

Esta propuesta no la revierte para los hosts que ya están documentados y
probados: introduce perfiles de host declarativos que fijan `managed` para
cada host nombrado en la matriz (Claude Code, Cursor, VS Code Copilot Chat,
Aider, Codex, MCP Inspector, clientes "vertex-aware"), preservando el
comportamiento actual byte a byte para ellos. El fallback por capacidad
sólo se activa para un `clientInfo.name` que **no** coincide con ningún
perfil conocido — es decir, hosts genuinamente nuevos o no identificados,
que es exactamente el caso que el hallazgo señala como peligroso: sin
perfil y sin declarar soporte de notificaciones, no hay ninguna garantía de
que el modelo sepa usar el router, así que `native` es la opción segura
(coste más alto, cero tools invisibles) en vez de `managed` silencioso
(coste más bajo, tools que nunca aparecen).

## Non-goals

- No se cambia el comportamiento de ningún host ya nombrado en
  `host-compatibility-matrix.md` — sus perfiles fijan exactamente el modo
  que la matriz ya documenta (`managed`).
- No se añade un campo estándar `tools.listChanged` al esquema de
  `ClientCapabilities` del SDK — no es una propiedad del protocolo MCP para
  clientes, inventar una violaría el esquema `ClientCapabilitiesSchema`
  importado del SDK.
- No se toca la semántica `visible` / `hidden` / `deactivated` de
  `tool-surface-runtime.service.ts` — el modo decidido aquí sólo alimenta
  `applySurfaceMode`, que ya existía.
- No se implementa aquí la evicción real del working set (`x00286`,
  slice hermana de la misma `q00011` S5).

## Architecture

```
decideSurfaceModeFromCapabilities(input)
 ├── input.explicitMode !== undefined?  → { mode: explicitMode, reason: 'explicit override' }  (gana siempre)
 ├── matchHostProfile(input.clientInfo?.name)
 │      HOST_MODE_PROFILES: readonly IHostModeProfile[]
 │      { match(name): boolean; mode; rationale }
 │      → perfil encontrado → { mode: perfil.mode, reason: perfil.rationale }
 └── fallback: detectClientSurfaceCapabilities(input)
        .listChangedSupport === true  → { mode: 'managed', reason: '... declared mcp-vertex/surface listChanged support' }
        .listChangedSupport === false → { mode: 'native',  reason: '... no known host profile and no declared listChanged support; native avoids stranding tools behind an undiscoverable notification' }

shouldRegisterSurfaceRouter(explicitMode)
 └── ahora LEE explicitMode: el router se sigue registrando en todos los
     modos (una lectura real del parámetro que documenta *por qué* — un
     `explicitMode === 'native'` sigue registrando el router porque
     `native` únicamente lo OCULTA de tools/list, no lo desactiva; ver
     `shouldExpose()` en tool-surface-runtime.service.ts) — deja de ser una
     constante sin lectura del argumento.
```

`HOST_MODE_PROFILES` vive en `packages/core/src/lib/surface/host-mode-profiles.constant.ts`
(nuevo), como datos declarativos — no requiere un tipo nuevo exportado más
allá de `IHostModeProfile` en `contracts/interfaces/`.

El `reason` ya se registra por stderr en cada transición real
(`create-mcp-project.ts:265`, sin cambios: ya pasa `decision.reason`). Esta
propuesta añade un campo `surfaceModeReason` a
`IStartupReportServerIdentity` (`startup-report/model.ts`), calculado en
`startup-report/assembly.ts` a partir de `input.plan.explicitMode` — el
Startup Report se genera en boot, antes del handshake MCP, así que sólo
puede mostrar la razón del *default* de arranque (explícito o "managed
pendiente de handshake"); la razón final por-cliente sigue siendo la línea
de stderr en `oninitialized`. El renderer la imprime junto a `surface` para
que el operador no confunda una cosa con la otra.

## Slices

### S1 — perfiles de host + fallback por capacidad en `decide-mode.ts`

- **Status**: done
- **Files**: [`packages/core/src/lib/surface/decide-mode.ts`, `packages/core/src/lib/surface/host-mode-profiles.constant.ts`, `packages/core/src/lib/contracts/interfaces/host-mode-profile.interface.ts`]
- **Gate**: `bunx vitest run --project core -- packages/core/tests/src/lib/surface/decide-mode.spec.ts`

### S2 — `reason` honesto en el Startup Report

- **Status**: done
- **Files**: [`packages/core/src/lib/startup-report/model.ts`, `packages/core/src/lib/startup-report/assembly.ts`, `packages/core/src/lib/startup-report/renderer.ts`]
- **Gate**: `bunx vitest run --project core -- packages/core/tests/src/lib/startup-report`

### S3 — hacer real la promesa de `native`: materializar los plugins lazy antes de exponer visibilidad

- **Status**: done
- **Why this slice exists**: S1/S2 dejaban el propio e2e
  (`defaults an UNKNOWN client with no listChanged signal to native`)
  en rojo. La decisión (`decideSurfaceModeFromCapabilities`) ya
  devolvía `'native'` correctamente, pero `applySurfaceMode` sólo
  voltea `record.access` — para una tool aún detrás de
  `bindLazyTool` eso mueve un booleano en un handle FALSO que nunca se
  pasó a `server.registerTool`; el SDK real nunca se entera y la tool
  sigue ausente de `tools/list`. `native` prometía "todo por
  adelantado, sin espera de descubrimiento" y no lo cumplía para
  ningún plugin cargado perezosamente — es decir, para todos (todo
  plugin retiene un activador lazy independientemente del modo, ver
  `assemble-plugins.ts`).
- **Fix**: nuevo `applySurfaceModeAsync` en `IToolSurfaceRuntime` —
  cuando `mode === 'native'`, materializa (vía `setLazyPluginLoader`)
  cada plugin que aún no cargó antes de delegar en el
  `applySurfaceMode` síncrono; para cualquier otro modo es
  exactamente equivalente al síncrono (no fuerza carga alguna,
  preservando el presupuesto de tokens de managed/adaptive/compact).
  `create-mcp-project.ts`'s `oninitialized` pasa a ser
  fire-and-forget-async (`void (async () => {...})()`) para poder
  `await` esa materialización — el callback del SDK no se espera de
  todas formas, y el propio e2e ya hacía polling sobre `tools/list`
  por esta misma razón de carrera.
- **Bug adicional encontrado y corregido en el camino**: `invokeTool`
  fusionaba el binding de una reactivación lazy con
  `this.recordsByRegistrationId.get(record.registrationId) ?? {...record, ...binding, lazyActivate: undefined}`
  — cuando el propio mapa YA contenía la misma referencia (caso normal
  de una activación no concurrente), esa expresión preferís el record
  viejo (sin handler) en vez de construir el nuevo desde `binding`,
  dejando `handler` `undefined` para siempre. Nunca se manifestaba
  antes porque `activate()` normalmente llama `bindRegisteredTool`
  como efecto secundario (actualizando el mapa por su cuenta); pero el
  activador retenido por `bindLazyTool` (el que x00286 reutiliza para
  relazy tras una eviction) NO tiene ese efecto secundario en la
  reactivación (su `materializeLazyTool` cachea y no vuelve a
  registrar). Corregido: sólo se prefiere el record del mapa cuando es
  una referencia DISTINTA a la de antes de `await activate()` (carrera
  real); si no cambió, se construye el merge desde `binding`.
- **Files**: [`packages/core/src/lib/project/tool-surface-runtime.service.ts`, `packages/core/src/lib/contracts/interfaces/tool-surface.interface.ts`, `packages/core/src/lib/project/create-mcp-project.ts`]
- **Gate**: `bunx vitest run --project core -- packages/core/tests/src/lib/e2e/tool-surface.e2e.spec.ts`

## Dependency graph

Ninguna dependencia entrante. S1/S2 no bloquean `x00286` (working set):
tocan `packages/core/src/lib/surface/**`, disjunto del working set. S3
(añadida durante la implementación, ver arriba) SÍ comparte archivo con
`x00286` — ambas tocan `tool-surface-runtime.service.ts` — pero cambian
partes no solapadas (`applySurfaceModeAsync`/el fix del merge en
`invokeTool` aquí; `evictIdlePlugins`/`setPluginDisposer` en `x00286`) y
se implementaron juntas en esta misma slice de `q00011` S5 sin conflicto.

## Acceptance

1. Cliente cuyo `clientInfo.name` no coincide con ningún perfil de
   `HOST_MODE_PROFILES` y no declara `mcp-vertex/surface` con
   `toolsListChanged: true` ⇒ `decideSurfaceModeFromCapabilities` devuelve
   `'native'`, con `reason` nombrando la señal (ausencia de perfil +
   ausencia de soporte declarado).
2. El mismo cliente con `toolsListChanged: true` declarado ⇒ `'managed'`,
   `reason` lo dice.
3. Cualquier `clientInfo.name` que coincida con un perfil de
   `HOST_MODE_PROFILES` (p. ej. `claude-code`, `cursor`) ⇒ el modo del
   perfil, sin importar `capabilities` — comportamiento sin cambios para
   los hosts documentados.
4. `explicitMode` gana sobre perfil y sobre capacidad, en ambos sentidos
   (forzar `native` en un host con perfil `managed`, y viceversa).
5. `shouldRegisterSurfaceRouter` no tiene ningún parámetro sin leer: se
   verifica con un test de comportamiento (pasar `'native'` y `'managed'`
   produce el mismo `true` documentado — el argumento se lee y se decide
   explícitamente devolver `true` en ambos casos, no por omisión) y con
   `bun tools/scripts/lint/types-in-contracts.script.ts` + revisión manual
   de que el parámetro ya no lleva el prefijo `_`.
6. `bun tools/scripts/typecheck.script.ts` verde.

## Risks and mitigations

| Riesgo | Mitigación |
| --- | --- |
| Un host real no listado en `HOST_MODE_PROFILES` que SÍ maneja bien `managed` (sin declarar la extensión) pasa a `native` y ve una lista de tools más grande | Es el trade-off que el hallazgo pide explícitamente: 284 KB usables por un host que puede necesitarlos completos, contra 8,9 KB que un host desconocido podría no saber redescubrir. `explicitMode` permite revertir por configuración sin tocar código. |
| Contradice, para hosts NO documentados, la política "managed universal" de ADR-0017 | Documentado explícitamente en `Why this design`; los hosts SÍ documentados (los que ADR-0017/r00026 estaban realmente probando) no cambian de comportamiento — sólo los no nombrados, que ADR-0017 nunca verificó individualmente. |
| Tokens: sube el coste de bootstrap para hosts que caen a `native` | Es el efecto deseado, no una regresión — mejor 284 KB usables que 8,9 KB con tools invisibles. |

## Notes

- El host-compatibility-matrix.md sigue siendo la fuente canónica de qué
  hosts tienen perfil fijo; `HOST_MODE_PROFILES` es su traducción a código,
  no un documento paralelo — si la matriz cambia, el array debe cambiar con
  ella (no hay generación automática en esta propuesta).
