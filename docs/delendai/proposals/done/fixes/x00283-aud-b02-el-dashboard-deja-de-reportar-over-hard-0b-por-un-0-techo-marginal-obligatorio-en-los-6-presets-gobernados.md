---
id: x00283
title: "AUD-B02 — el dashboard deja de reportar 'over hard (0B)' por un `?? 0`; techo marginal obligatorio en los 6 presets gobernados"
kind: fix
status: done
type: fix
track: tokens
date: 2026-08-27
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-B02
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P1
related: [q00011, r00036, x00284]
---

# x00283 — el dashboard reporta "over hard (0B)" en 4 de 6 presets por un `?? 0`

## Goal

`marginalPluginHard`/`marginalPluginWarning` pasan de opcionales a
**obligatorios** en el contrato de todo preset gobernado
(`IGovernedToolsListBudget`), con valores reales para los cuatro presets
que no los tenían (`minimal`, `standard`, `full`, `vertex`), justificados
contra la medición actual. El dashboard generado
(`docs/mcp-vertex/TOKEN-BUDGETS.md`) deja de contener la cadena `(0B)` y
el e2e de presupuestos asserta el techo marginal en los 6 presets
gobernados, no sólo en 2.

## why

`marginalPluginHard` sólo estaba definido para `lean` (30.000) y `swarm`
(80.000). El dashboard hacía:

```ts
// tools/scripts/report/token-budget-dashboard.script.ts:167 (antes del fix)
hard: toolsListBudget.marginalPluginHard ?? 0,
```

así que para `minimal`, `standard`, `full` y `vertex` el techo marginal
era **0 bytes** y cualquier plugin lo superaba. El artefacto versionado
declaraba `over hard (0B)` en la columna `Marginal Status` de esos cuatro
presets en cada regeneración, mientras `tokens-budget-real`
(`bun run tokens:gate`) estaba en verde porque ese gate no comprueba el
techo marginal en absoluto, y `token-budget.e2e.spec.ts:360,393` sólo lo
asertaba para `swarm` y `lean`.

Un documento generado y versionado que afirma una violación permanente
que ningún gate comparte enseña a leer el dashboard ignorando su columna
de estado — justo la que debería mirarse primero.

## why this design

La solución mínima (renderizar `n/a` cuando el campo falta) habría hecho
desaparecer el falso "over hard (0B)" sin resolver el problema real: un
techo marginal *opcional* en un contrato de presupuesto es una
contradicción — o el plugin más grande de un preset gobernado tiene un
límite, o no lo tiene, pero no puede depender de si alguien recordó
rellenar el campo. Por eso el fix es de tipo, no de render:
`marginalPluginHard`/`marginalPluginWarning` se mueven a un tipo nuevo,
`IGovernedToolsListBudget`, que las declara `readonly number` (no
opcionales) y que es el tipo de `toolsList` en `IPresetTokenBudgetProfile`
— el compilador rechaza cualquier preset gobernado que no las declare.
`ITokenBudgetSurface` (con los campos opcionales) se conserva para las
superficies que genuinamente no tienen noción de techo marginal
(`toolPayloads.*`, `overviewCompact`, `roundContext`): ahí `n/a` sigue
siendo la respuesta correcta y el dashboard sigue rindiéndolo así.

Los cuatro valores nuevos salen de la tabla de concentración por owner
del propio informe (snapshot `2cf17373`), excluyendo `core` — el techo
marginal nunca gobierna el roster siempre-encendido, que ya tiene su
propio `toolsList.hard/warning`:

- **`minimal`** (`hard: 7_000`, `warning: 6_000`): el mayor contribuyente
  no-core medido es `git` con 5.065 B. Guardia pequeña sobre la medición
  actual.
- **`standard`** (`hard: 11_000`, `warning: 9_500`): el mayor
  contribuyente no-core medido es `memory` con 8.221 B.
- **`full`** y **`vertex`** (`hard: 80_000`, `warning: 70_000` en ambos):
  el mayor contribuyente no-core medido en los dos es `proposals` con
  45.277 B — el mismo plugin, el mismo coste absoluto que ya mide
  `swarm` (que también carga `proposals` a 45.277 B). Reutilizar el techo
  de `swarm` no es copiar por comodidad: es el mismo plugin al mismo
  coste real, así que el mismo techo gobernado aplica con honestidad.

Ninguno de los cuatro valores se fijó "justo por encima de lo medido"
(el vicio que documenta `AUD-B03`/`r00036`): cada uno deja un margen
real (39% en minimal, 34% en standard sobre warning; ~55% en full/vertex)
para que una tool nueva razonable no dispare el gate, sin licenciar un
salto a escala de plugin completo.

## non-goals

- No se cambia ningún techo `toolsList.hard/warning` (el ceiling total
  por preset) — eso es lo que documenta `AUD-B03` y blinda `r00036`; este
  fix es sólo el techo marginal por plugin.
- No se poda ningún `outputSchema` — eso es `v00129`/`v00130`/`v00131`.
- No se añade el mecanismo de excepción con caducidad para futuras subidas
  de techo — eso es `r00036`, que depende de este fix (primero honesto,
  luego blindado).
- No se toca `measureBootstrapBytes` ni la medición del bootstrap
  adaptativo — eso es `x00284`/`AUD-B04`.

## architecture

```
ITokenBudgetSurface          (sin cambios: marginal opcional)
  hard, warning, releaseRelativePercent
  marginalPluginHard?, marginalPluginWarning?

IGovernedToolsListBudget     (NUEVO)
  extends ITokenBudgetCeiling
  marginalPluginHard: number       // ahora obligatorio
  marginalPluginWarning: number    // ahora obligatorio

IPresetTokenBudgetProfile
  toolsList: IGovernedToolsListBudget   // antes: ITokenBudgetSurface
  overviewCompact?: ITokenBudgetSurface // sin cambios
  roundContext?: ITokenBudgetSurface    // sin cambios
```

`token-budget-dashboard.script.ts`:
- `presetToolsBudget()` devuelve `IGovernedToolsListBudget | undefined`
  (importado de `@mcp-vertex/core/public`); `undefined` sólo para
  presets fuera de `TOKEN_BUDGETS.presets` (los `dashboardPresetIds` no
  gobernados: `web-app`, `backend-api`, `cli-tool`), que siguen
  renderizando `n/a` en las tres columnas de estado — ese es el único
  caso legítimamente opcional que queda.
- `presetMarginalBudget()` ya no hace `?? 0`: si `presetToolsBudget()`
  devuelve un valor, los dos campos marginales existen por contrato.

**Tests.**
- `token-budget.e2e.spec.ts`: se añade `it.each(['minimal', 'standard',
  'full', 'vertex'])` que conecta cada preset gobernado, calcula
  `marginalPluginBytes` sobre las tools reales y lo compara contra
  `TOKEN_BUDGETS.presets[presetId].toolsList.{marginalPluginHard,
  marginalPluginWarning}` sin fallback — junto con las aserciones ya
  existentes de `swarm`/`lean`, cubre los 6 presets gobernados.
- `tools/tests/report/no-zero-marginal-ceiling.spec.ts` (NUEVO): genera
  el markdown completo vía `buildTokenBudgetDashboardMarkdown()` y
  asserta que la cadena `(0B)` no aparece en ningún sitio — guarda
  específicamente contra la regresión exacta que encontró la auditoría,
  no sólo contra el tipo.

## slices

### S1 — tipo obligatorio + valores reales

- **Status**: done
- **Files**: [`packages/core/src/lib/contracts/constants/token-budgets.constant.ts`, `packages/core/src/public/index.ts`]
- **Gate**: `bun tools/scripts/typecheck.script.ts`

Se añade `IGovernedToolsListBudget` (marginal obligatorio), se cambia el
tipo de `toolsList` en `IPresetTokenBudgetProfile`, y se rellenan
`marginalPluginHard`/`marginalPluginWarning` para `minimal`, `standard`,
`full` y `vertex` con la justificación de la sección "why this design"
documentada como comentario junto a cada valor. Se exporta el tipo nuevo
desde el barrel público.

### S2 — dashboard sin `?? 0`

- **Status**: done
- **Files**: [`tools/scripts/report/token-budget-dashboard.script.ts`]
- **Gate**: `bun tools/scripts/report/token-budget-dashboard.script.ts && ! grep -q '(0B)' docs/mcp-vertex/TOKEN-BUDGETS.md`

`presetToolsBudget`/`presetMarginalBudget` se tipan contra
`IGovernedToolsListBudget` y dejan de necesitar el fallback.

### S3 — e2e y guard de regresión

- **Status**: done
- **Files**: [`packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts`, `tools/tests/report/no-zero-marginal-ceiling.spec.ts`]
- **Gate**: `bunx vitest run --project core -- packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts && bunx vitest run --project tools -- tools/tests/report/no-zero-marginal-ceiling.spec.ts`

## dependency graph

Ninguna dependencia previa. `r00036` depende de este fix (el ratchet
descendente necesita techos honestos antes de poder blindarlos).
`x00284` es independiente (mide una superficie distinta) pero ambos son
prerequisito de `v00129` según `q00011`.

## acceptance

1. `docs/mcp-vertex/TOKEN-BUDGETS.md` regenerado no contiene la cadena
   `(0B)`.
2. Los 6 presets gobernados (`minimal`, `lean`, `standard`, `swarm`,
   `full`, `vertex`) declaran `marginalPluginHard`/`marginalPluginWarning`
   reales, verificado por el tipo (`bun tools/scripts/typecheck.script.ts`
   falla si falta alguno) y por el e2e (asserta los 6, no 2).
3. Ningún preset introduce una violación marginal nueva: la medición
   actual de cada preset queda `within hard` contra su nuevo techo.
4. `bun run tokens:gate` y `bun run tokens:dashboard:check` en verde.

## risks and mitigations

| Riesgo | Mitigación |
| --- | --- |
| Un futuro plugin de perfil grande (tipo `proposals`) se añade a `minimal`/`standard` y dispara el techo marginal nuevo, más ajustado que el de `full`/`vertex` | Es el comportamiento deseado: el plan (`q00011`) declara explícitamente como non-goal "no añadir plugins nuevos hasta recuperar margen en minimal y lean" — si ese non-goal se revisa, el techo se revisa a la vez, con la excepción documentada que introduce `r00036` |
| Reutilizar el techo de `swarm` para `full`/`vertex` esconde que en el futuro `proposals` podría crecer de forma distinta en cada preset | Los tres presets cargan literalmente el mismo plugin con el mismo build; si diverge, el e2e por preset (S3) lo detecta preset por preset, no de forma agregada |

## notes

Los números medidos en el momento de escribir esta propuesta (mismo
snapshot que el informe, medidos vía
`bun tools/scripts/report/token-budget-dashboard.script.ts`) pueden
diferir en unos pocos KB de los citados por la auditoría porque el
repositorio comparte el worktree con otro agente trabajando en paralelo
sobre `packages/core/src/lib/plugins/managed-lazy-runtime.ts` y
ficheros relacionados (fuera del territorio de este fix); la
justificación de los cuatro techos usa las cifras de owner (`core`
51.786 B, `proposals` 45.277 B) que se mantuvieron estables durante todo
el trabajo.
