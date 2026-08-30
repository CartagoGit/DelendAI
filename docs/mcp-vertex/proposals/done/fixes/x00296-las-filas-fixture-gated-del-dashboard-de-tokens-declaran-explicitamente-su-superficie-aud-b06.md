---
id: x00296
title: "Las filas fixture-gated del dashboard de tokens declaran explícitamente su superficie (AUD-B06)"
kind: fix
status: done
type: proposal
track: tokens
date: 2026-08-29
priority: P1
related:
    - q00011
    - v00129
    - x00283
    - x00285
    - r00036
---

# x00296 — Las filas *fixture-gated* declaran su superficie (AUD-B06)

## Goal

Que cada fila *fixture-gated* del dashboard de tokens
(`overview full`, `overview compact`, `auto_work idle`, …) declare
explícitamente qué superficie MCP está midiendo (`managed` o
`native`), en vez de heredar `capabilities: {}` y dejar que
`decideSurfaceModeFromCapabilities` decida por omisión. El objetivo no
es bajar ningún número — está prohibido subir techos sin excepción
documentada (`r00036`) y esta propuesta tampoco los baja — sino que la
fila mida deliberadamente lo que su techo fue calibrado para medir.

## why

`tools/scripts/report/token-budget-report-lib.ts:294-296`
(`connectTokenBudgetClient`) construye el cliente MCP sintético de las
filas *fixture-gated* así:

```ts
const client = new Client(
    options.clientInfo ?? DYNAMIC_SURFACE_CLIENT_INFO,
    { capabilities: options.capabilities ?? {} },
);
```

`measureFixtureSurfaces()` (`token-budget-dashboard.script.ts:178-190`)
llama a `connectTokenBudgetClient` para sus tres conexiones (`base`,
`catalog`, `extra`) **sin** pasar `surfaceMode` ni `capabilities`. Ese
cliente no declara `tools.listChanged`. Antes de `x00285`,
`decideSurfaceModeFromCapabilities` devolvía `'managed'`
incondicionalmente (el bug de `AUD-C01`), así que daba igual: la fila
medía siempre el bootstrap gestionado. Tras `x00285` (ya en la rama,
ver `done/fixes/x00285-decide-mode-lee-al-cliente.md`), el mismo
cliente sin capabilities declaradas resuelve correctamente a
`'native'`, y la fila pasa a medir la superficie completa.

**Evidencia (bisección de la propia auditoría, reproducible con
`git checkout <sha> && bun tools/scripts/report/token-budget-dashboard.script.ts`):**

| Commit | `overview full` |
| --- | ---: |
| `2cf17373` (snapshot auditado) | 1.466 B — `within hard` |
| `ab4ec6ff` (entra `x00285`) | 11.484 B — `over hard` |

El techo (`hard: 11_100`, `warning: 11_000`, en
`packages/core/src/lib/contracts/constants/token-budgets.constant.ts`)
no se tocó entre esos dos commits. Lo que cambió es **qué objeto se
mide**: antes, el bootstrap gestionado (6 tools); después, la
superficie nativa completa (63 tools en el momento de la auditoría).

**Medido en esta sesión** (`docs/mcp-vertex/TOKEN-BUDGETS.md`, sección
"Fixture-gated surfaces", generado con
`token-budget-dashboard.script.ts` sin tocar el fixture):

| Fila | Bytes | Techo (hard) | Estado |
|---|---:|---:|---|
| `overview full` | 11.727 | 11.100 | `over hard (11.100B)` |
| `overview compact` | 1.651 | 1.500 | `over hard (1.500B)` |

Confirma el hallazgo: dos filas del artefacto de tokens versionado
reportan `over hard` hoy, y el motivo no es que el payload haya
crecido de forma alarmante desde que se calibró el techo — es que el
techo se calibró contra una superficie (`managed`) y ahora se compara
contra otra (`native`).

## why this design

**No se sube ningún techo.** `r00036` (ya en la rama) exige una
excepción documentada con caducidad para subir cualquier `hard`; esta
propuesta no la aporta porque no es ese el arreglo — el propio
hallazgo lo prohíbe explícitamente: *"Prohibido: subir el techo para
que pase."*

**No se persigue aquí la arquitectura ideal completa** (`overview`
apareciendo dos veces, gestionada y nativa, cada una con su propio
techo justificado) como una única slice monolítica, porque decidir el
techo nuevo de la fila nativa requiere datos que hoy no existen — el
propio hallazgo dice *"cada una con su propio techo… justificados"*, y
un techo nuevo justificado necesita más que "lo que mide hoy más un
margen" (eso es exactamente el patrón que `AUD-B03`/`r00036` acaban de
prohibir). Por eso esta propuesta se divide en dos slices: la primera
restaura la comparación "peras con peras" declarando explícitamente
`managed` donde el techo ya calibrado lo espera (arregla el bug de
raíz, sin tocar ningún número); la segunda añade las filas nativas
nuevas con su propio techo, siguiendo el mismo proceso de
`justify-the-cost` que exige `r00036` en vez de improvisar un número.

**No se cambia `decideSurfaceModeFromCapabilities` ni `x00285`.** El
bug no está ahí — `x00285` hace exactamente lo que su nombre promete
(leer `clientInfo`/`capabilities` del cliente real). El bug está en
que el *fixture* de medición nunca declaró explícitamente qué cliente
real estaba simulando.

## non-goals

- **Subir `overviewFull.hard`/`.warning` o `overviewCompact.hard`/`.warning`.**
  Prohibido explícitamente por el hallazgo y por `r00036`.
- **Añadir las cuatro métricas de "superficie útil" de `AUD-B05`.**
  Cubierto por `f00272`, sin relación con esta medición.
- **Tocar `measureBootstrapBytes`** (el bug relacionado pero distinto
  de `AUD-B04`, ya cubierto por `x00284`) — mide un objeto distinto
  por una razón distinta (serializa `{name, toolId, summary}` en vez
  del payload real de `tools/list`); esta propuesta no lo toca.
- **Las filas de `measurePresetDashboard`** (la tabla "Real preset
  dashboard", con columnas `Measurement Surface`/`Runtime Surface`
  explícitas) — esas **ya** declaran su superficie correctamente vía
  `DASHBOARD_SURFACES` (`measurement.surfaceMode`,
  `measurement.clientInfo`, `measurement.capabilities`); el bug es
  específico de `measureFixtureSurfaces`, que no sigue ese patrón ya
  existente en el mismo fichero.

## architecture

`measureFixtureSurfaces()` construye hoy tres clientes
(`base`/`catalog`/`extra`) sin declarar superficie. Pasan a declararla
explícitamente reutilizando el mismo mecanismo que
`measurePresetDashboard` ya usa (`surfaceMode` en
`connectTokenBudgetClient`, que se traduce en `--surface=<mode>` y
activa la rama de `explicitMode` en `decideSurfaceModeFromCapabilities`,
sin pasar por la inferencia basada en `capabilities`):

```ts
const base = await connectTokenBudgetClient(workspace, {
	pluginList: TOKEN_BUDGETS.fixturePluginIds.join(','),
	surfaceMode: 'managed', // declarado, no inferido — S1
});
```

Las filas que hoy existen (`overview full`, `overview compact`,
`auto_work idle`, `auto_work work plan`, `agent_catalog compact`,
`agent_catalog full`, `analyze_project {}`, `plan_mcp_project {}`)
pasan a medir explícitamente `managed`, restaurando la comparación
contra los techos ya calibrados para esa superficie (S1). Las filas de
`search`/`docs`/`round_context`/`logs_tail` (cliente `extra`) se
auditan aparte en S1 porque usan una lista de plugins distinta
(`'proposals,memory,search,docs,logs'`, sin preset) — declaran
`managed` también, salvo que la medición revele que ya estaban
calibradas contra `native` (se decide con datos, no por defecto).

S2 añade una segunda ronda de medición explícita `surfaceMode:
'native'` para `overview full`/`overview compact`, con dos filas
nuevas en la tabla ("overview full (native)" / "overview compact
(native)") y sus propios `hard`/`warning` en `ITokenBudgetSurface`,
calculados a partir de la medición real más el guard band mínimo que
`r00036` exige documentar — no una redefinición de los techos
`managed` existentes.

## slices

### S1 — Declarar `managed` explícito en las filas fixture-gated existentes

- **Status**: done
- **Files**:
    - `tools/scripts/report/token-budget-dashboard.script.ts`
      (`measureFixtureSurfaces`)
    - `tools/scripts/report/token-budget-report-lib.ts` (si hace falta
      ampliar `connectTokenBudgetClient` para que `surfaceMode` cubra
      también el cliente `extra`)
    - `packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts`
    - `docs/mcp-vertex/TOKEN-BUDGETS.md` (regenerado)
- **Gate**: `bunx vitest run --project core`,
  `bun run tokens:gate`, `bun run tokens:ceiling-ratchet`,
  `bun run tokens:dashboard:check`, `bun tools/scripts/typecheck.script.ts`

Pasa `surfaceMode: 'managed'` explícito en las llamadas a
`connectTokenBudgetClient` de `measureFixtureSurfaces` (clientes
`base`, `catalog`, `extra`). Requiere ampliar primero el tipo de
`surfaceMode` en `connectTokenBudgetClient`
(`tools/scripts/report/token-budget-report-lib.ts:272`), hoy acotado a
`'native' | 'adaptive' | 'compact'` — no incluye `'managed'` aunque
`IMcpToolSurfaceMode` sí lo declara como modo canónico
(`packages/core/src/lib/contracts/interfaces/surface-mode.interface.ts:7-11`).
Objetivo medido: `overview full` y
`overview compact` vuelven a leer `within hard` sin haber tocado
ningún techo, porque vuelven a medir la superficie contra la que esos
techos se calibraron. Añade un test de regresión: cambiar el default
de `decideSurfaceModeFromCapabilities` no debe alterar ninguna fila
fixture-gated, exactamente el escenario que rompió esta vez.

**Importante — orden de los gates**: correr `tokens:dashboard:check`
**antes** de regenerar `TOKEN-BUDGETS.md` a mano — regenerar primero
deja el gate en verde sin haber comprobado nada (lección ya
documentada por la sesión que originó esta propuesta).

**Desviación medida frente al texto original de esta slice**: el
arquitecto listaba las 8 filas (`overview full/compact`, `auto_work
idle/work plan`, `agent_catalog compact/full`, `analyze_project {}`,
`plan_mcp_project {}`) como candidatas a declarar `managed`. Medido
antes de tocar código (`base.client.callTool` bajo `surfaceMode:
'managed'` explícito): `overview` es la ÚNICA de esas ocho que
responde con un payload real bajo `managed` — el resto (`auto_work`,
`agent_catalog`, `analyze_project`, `plan_mcp_project`, y también
`search`/`docs`/`round_context`/`logs_tail` del cliente `extra`)
devuelve `MCP error -32602: Tool <name> disabled` (o `not found`)
cuando se invocan por nombre directo bajo `managed` — por diseño,
`managed` solo expone esas tools a través del router `vertex`, nunca
por nombre directo. Forzar `managed` en esas filas no habría
"restaurado" la comparación pera-con-pera que pide el `goal`: habría
sustituido cada una por un stub de error de tamaño fijo (56-67 B) que
pasaría cualquier techo para siempre, ocultando cualquier crecimiento
real futuro — literalmente peor que el bug que esta propuesta arregla.
Aplicando el mismo principio que el propio `risks and mitigations` ya
exige para el cliente `extra` ("declarar la verdad, no forzar un valor
único"): solo `overview full`/`overview compact` declaran `managed`
(en una conexión `overviewSurface` dedicada); el resto declara
`native` explícito, que es la superficie que esas filas ya medían
correctamente antes de esta propuesta (bytes idénticos, verificado) y
contra la que sus techos ya estaban calibrados. Ver el comentario en
`measureFixtureSurfaces` (`token-budget-dashboard.script.ts`) para el
detalle y la evidencia reproducible.

### S2 — Filas nativas nuevas para `overview`, con techo propio y justificado

- **Status**: done
- **Files**:
    - `packages/core/src/lib/contracts/constants/token-budgets.constant.ts`
      (nuevos `overviewFullNative`/`overviewCompactNative`, o
      equivalente, en `ITokenBudgetSurface`)
    - `tools/scripts/report/token-budget-dashboard.script.ts`
      (dos filas nuevas: "overview full (native)" / "overview compact
      (native)")
    - `packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts`
    - `docs/mcp-vertex/TOKEN-BUDGETS.md` (regenerado)
- **Gate**: `bunx vitest run --project core`,
  `bun run tokens:gate`, `bun run tokens:ceiling-ratchet`,
  `bun run tokens:dashboard:check`, `bun tools/scripts/typecheck.script.ts`

Añade un techo nuevo, no una redefinición del existente, para la
superficie `native` de `overview`. El número debe salir de una
medición real repetida (no de "lo de hoy más margen" sin más, que es
justo el patrón que `AUD-B03` documentó como deriva) y debe pasar el
proceso de cuatro pasos de `bumpPolicy`/`r00036` si excede lo que un
primer techo conservador permitiría. Documenta en el propio commit por
qué el número elegido es el correcto, no solo cuál es.

## dependency graph

```
x00285 (ya en la rama) ──► S1 ──► S2
r00036 (ya en la rama) ──────────►┘
```

S1 depende únicamente de que `x00285` ya esté mergeado (lo está). S2
depende de S1 (necesita el fixture ya corregido para medir la
superficie nativa de forma limpia) y de `r00036` (ya en la rama, para
el proceso de justificación del techo nuevo).

## acceptance

- `overview full` y `overview compact` en la sección "Fixture-gated
  surfaces" de `TOKEN-BUDGETS.md` leen `within hard` tras S1, sin que
  ningún `hard`/`warning` existente haya cambiado de valor.
- Cada fila fixture-gated nombra qué superficie mide (`managed` o
  `native`), igual que ya hacen las tablas de presets con
  `Measurement Surface`/`Runtime Surface`.
- Tras S2, existen dos filas nuevas ("overview full (native)" /
  "overview compact (native)") con techo propio, justificado por
  medición real y documentado, no copiado del existente ni derivado
  por defecto.
- Ningún techo sube sin pasar por el proceso de `r00036` (excepción
  documentada + caducidad); ninguna de las dos slices lo necesita
  porque ninguna sube un techo existente.
- `bunx vitest run --project core` en verde.
- `bun run tokens:gate`, `bun run tokens:ceiling-ratchet` y
  `bun run tokens:dashboard:check` en verde tras cada slice.
- `bun tools/scripts/typecheck.script.ts` en verde.

## risks and mitigations

- **Riesgo: declarar `managed` explícito en el fixture esconde una
  regresión real de tamaño de `overview` bajo la superficie gestionada
  si esta crece en el futuro.** Mitigación: ninguna nueva — es
  exactamente el mismo riesgo que existía antes del bug de `AUD-C01`,
  cubierto por el mismo techo `managed` que siempre gobernó esa fila;
  esta propuesta restaura ese gobierno, no lo debilita.
- **Riesgo: el cliente `extra` (usado por `search`/`docs`/
  `round_context`/`logs_tail`) resulta que ya medía `native`
  deliberadamente (por ejemplo si esas tools solo importan bajo
  superficie completa) y forzar `managed` ahí rompería esas filas.**
  Mitigación: S1 mide primero con `console.log`/una corrida de
  diagnóstico antes de fijar `surfaceMode` en el cliente `extra`; si
  la medición actual ya coincide con lo que un `native` explícito
  daría, se declara `native` para ese cliente en vez de `managed` —
  la propuesta pide declarar la verdad, no forzar un valor único para
  los tres clientes.
- **Riesgo: elegir un techo nativo arbitrario en S2 solo para que
  pase, repitiendo el patrón de `AUD-B03`.** Mitigación: `r00036` ya
  bloquea esto por diseño (una subida sin excepción documentada con
  caducidad falla el lint); S2 no introduce una subida de un techo
  existente, así que ni siquiera necesita la excepción — pero el
  número debe justificarse igual en el commit, por disciplina, no
  solo porque el gate lo exija.
- **Riesgo: confundir esta propuesta con arreglar el tamaño real de
  `overview`.** Mitigación: explícito en el `goal` — esta propuesta es
  de medición, no de poda; la poda de `overview` (si hiciera falta)
  la cubren `v00129` (ya aplicó `compactOutputSchema()` a `overview`)
  y cualquier propuesta futura de reducción de payload de respuesta,
  no ésta.

## notes

Este hallazgo es, en palabras de la propia auditoría, un caso
instructivo repetido: *"arreglar un bug hizo visible que una métrica
nunca había medido lo que su nombre decía"* — exactamente el mismo
patrón que `AUD-B04` encontró en `measureBootstrapBytes` (cubierto por
`x00284`), por la misma causa raíz: una función de medición que no
declaraba explícitamente qué superficie estaba midiendo. Ambos
arreglos son independientes entre sí (tocan ficheros distintos) pero
comparten la misma lección de diseño: toda medición de superficie
debe nombrar su superficie, nunca heredarla por defecto de una
inferencia que puede cambiar de comportamiento por una razón ajena a
la medición.

Ficheros de referencia:

- `tools/scripts/report/token-budget-report-lib.ts`
- `tools/scripts/report/token-budget-dashboard.script.ts`
- `packages/core/src/lib/contracts/constants/token-budgets.constant.ts`
- `docs/mcp-vertex/proposals/done/fixes/x00285-decide-mode-lee-al-cliente.md`
- `docs/mcp-vertex/proposals/done/refactors/r00036-ratchet-descendente-techos-tokens.md`
- `docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md` (AUD-B06)
