---
id: t00030
title: "Cobertura: apretar los umbrales al valor real + branches >=80% en core/plugins, core/dry-run y core/project"
kind: test
status: ready
type: proposal
track: testing
date: 2026-08-29
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-F01
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P1
related: [q00011]
---

# t00030 — Cobertura: apretar los umbrales + branches ≥80% en los módulos P0

## Goal

Cerrar la holgura de ~2 puntos entre los umbrales de cobertura
configurados en `vitest.config.ts` y la cobertura real medida, y
añadir un umbral de **branches por paquete** más estricto
(`≥80%`) para los tres módulos donde vivieron los bugs de esta
auditoría: `packages/core/src/lib/plugins`,
`packages/core/src/lib/dry-run` y `packages/core/src/lib/project`.

## why

**Comportamiento verificado.** `vitest.config.ts:124-129` declara:

```ts
thresholds: {
    statements: 80,
    branches: 67,
    functions: 79,
    lines: 81,
},
```

con el comentario en la línea 82: *"The thresholds are a no-regression
gate set a few points under the current numbers — tighten them as
coverage grows."* Confirmado que nunca se apretaron desde que se
escribió ese comentario (los valores del fichero en HEAD coinciden
exactamente con los que cita `AUD-F01`).

**Cifras reales — no se dan por buenas sin remedición.** El informe
cita 82,27/69,04/82,94/83,94 (statements/branches/functions/lines)
medidos en una sesión anterior. Esta sesión **no ha vuelto a correr
`bun run test:coverage`** (la suite completa es costosa y este
territorio es sólo de escritura de propuestas, no de implementación)
— así que los cuatro valores finales de S1 deben confirmarse
midiendo en vivo antes de fijarlos, exactamente como exige la
"solución arquitectónica ideal" del propio hallazgo (trinquete
automático = medida − 0,5, no un número copiado de un informe
anterior). Lo que sí se ha verificado en esta sesión: los cuatro
umbrales actuales en `vitest.config.ts` son los citados por el
informe, así que la holgura descrita existe con seguridad — sólo el
valor exacto al que se aprietan queda pendiente de la remedición de
S1.

**Por qué es un problema.** Un umbral con holgura no es un trinquete,
es un suelo blando: la cobertura puede caer dos puntos enteros sin que
ningún gate se entere. El dato que más importa es `branches` (67% en
el umbral, ~69% medido): casi un tercio de las ramas condicionales del
repo no se ejercita, y las ramas son exactamente donde viven los
`catch`, los fallbacks y los casos límite — el terreno de todos los
bugs P0/P1 de esta auditoría (dry-run que detecta en vez de prevenir,
`parsed.data` descartado en la ruta lazy, `dispose` perdido, `eager`
inexpresable, `protectedBranches` fail-open). Ninguno vivía en el
camino feliz.

**Verificación de la capacidad técnica del "branches por paquete".**
Confirmado en `node_modules` (vitest 4.1.11,
`@vitest/coverage-v8` `coverage.d.ts`) que el provider v8 soporta
umbrales por patrón glob ("thresholds ... for specific files defined
by glob pattern or global for all other files") — la propuesta del
informe de un umbral de branches específico para
`core/plugins`/`core/dry-run`/`core/project` es implementable
nativamente en `vitest.config.ts`, sin script adicional.

## why this design

Se separan en dos slices independientes porque tienen ciclos de vida
distintos: apretar los cuatro umbrales globales (S1) es un ajuste de
número que se puede hacer y verificar en una sola sesión, apenas se
tenga la medición fresca. El trinquete automático (S3, arquitectura
ideal) es una herramienta nueva (`coverage-ratchet.script.ts`) que
sigue el mismo idioma que `file-conventions.baseline.json` /
`type-naming.baseline.json` ya usado en el repo para deuda técnica
con baseline — construirlo bien vale más que apretar los números a
mano cada vez, pero no debe bloquear el cierre inmediato de la holgura
actual (S1).

Los umbrales de branches por paquete (S2) usan la sintaxis glob nativa
de `@vitest/coverage-v8` en vez de un script separado, porque el
provider ya lo soporta — construir una herramienta propia duplicaría
una capacidad que el proveedor de cobertura ya expone y que el propio
`vitest.config.ts` del repo ya configura declarativamente (ver
`include`/`exclude` existentes en la misma sección).

Se prioriza `core/plugins`, `core/dry-run` y `core/project` (no todo
`packages/core`) porque son, verificado en esta auditoría, los tres
directorios donde AUD-D02 (dry-run detecta, no previene), AUD-E01
(divergencia eager/lazy) y AUD-D05/AUD-D06 (dispose y protectedBranches)
tienen su código — el 69% global esconde que estas zonas concretas
están peor, y son las que más urgen ejercitar en caminos de error tras
los fixes P0/P1 de la Ola 1 del plan `q00011`.

## non-goals

- Escribir los tests de error para los P0/P1 concretos (D02, E01,
  E02, D05, D06) — esos ya son slices de sus propias propuestas
  (`r00037`, `r00038`, `r00039`, `x00291`, `x00292`). Este `t00030`
  sólo instala el gate; lo que sube la cobertura de branches en esos
  módulos es el trabajo de esas propuestas.
- Umbrales por paquete para módulos fuera de los tres nombrados —
  fuera de alcance por ahora; puede ampliarse en una propuesta de
  seguimiento si el trinquete de S3 revela otras zonas débiles.
- Cambiar el `provider` de cobertura (v8) o el `reporter` — no forma
  parte del hallazgo.

## architecture

`vitest.config.ts` `coverage.thresholds` gana, junto a los cuatro
umbrales globales apretados, entradas por glob para los tres módulos
de riesgo, usando la forma que soporta `@vitest/coverage-v8`:

```ts
thresholds: {
    statements: <medido - 0.5>,
    branches: <medido - 0.5>,
    functions: <medido - 0.5>,
    lines: <medido - 0.5>,
    'packages/core/src/lib/plugins/**': { branches: 80 },
    'packages/core/src/lib/dry-run/**': { branches: 80 },
    'packages/core/src/lib/project/**': { branches: 80 },
},
```

(la forma exacta de las claves glob-por-módulo se confirma contra la
API real de `@vitest/coverage-v8` 4.1.11 en S2 — el `.d.ts` confirma
la capacidad pero no fue objeto de esta sesión reproducir la sintaxis
exacta de configuración en un run real).

El trinquete automático (S3) es un nuevo
`tools/scripts/coverage-ratchet.script.ts` que, tras una corrida de
`vitest run --coverage --reporter=json-summary`, lee
`.cache/coverage/coverage-summary.json`, calcula `medida − 0,5` para
cada una de las cuatro métricas globales, compara con los umbrales
vigentes en `vitest.config.ts`, y falla (exit 1) si el fichero quedó
desactualizado — mismo patrón de "falla si el baseline no se
actualizó" que `type-naming.script.ts --update` (ver `c00157`).

## slices

### S1 — Apretar los cuatro umbrales globales al valor medido

- **Status**: done
- **Files**:
    - `vitest.config.ts` (actualizar `coverage.thresholds` con la
      medición fresca de esta corrida menos 0,5 puntos)
- **Gate**: `bun run test:coverage` (debe pasar en verde contra los
  nuevos umbrales; el propio comando falla si la cobertura real cae
  por debajo)

### S2 — Umbral de branches ≥80% por paquete en los tres módulos P0

- **Status**: done
- **Files**:
    - `vitest.config.ts` (entradas glob-por-módulo en
      `coverage.thresholds` para `packages/core/src/lib/plugins/**`,
      `packages/core/src/lib/dry-run/**`,
      `packages/core/src/lib/project/**`)
- **Gate**: `bun run test:coverage` — debe fallar deliberadamente si
  se rebaja el branches real de alguno de los tres módulos por debajo
  de 80% (probar con un cambio temporal en un fixture antes de
  revertir, documentado en el PR)

### S3 — Trinquete automático (arquitectura ideal)

- **Status**: done
- **Files**:
    - `tools/scripts/coverage-ratchet.script.ts` (nuevo)
    - `tools/scripts/coverage-ratchet.script.spec.ts` (nuevo)
    - `package.json` (script `coverage:ratchet` + entrada en
      `validate` o en un workflow de CI programado, a decidir en
      implementación — no bloquea `validate` en cada PR si el runtime
      de `test:coverage` completo es costoso)
- **Gate**: `bunx vitest run tools/scripts/coverage-ratchet.script.spec.ts`

## dependency graph

`t00030` "acompaña a toda la Ola 1" según el grafo de `q00011`: los
tests de caminos de error que las propuestas P0 (`r00038`, `r00039`,
`x00291`, `x00290`) y P1 (`r00037`, `x00289`, `x00292`) añaden suben
la cobertura de branches de `core/plugins`/`core/dry-run`/`core/project`
por sí solas, así que S2 (el umbral de 80% en esos tres módulos) debe
mergearse **después** de que esas propuestas hayan añadido sus propios
tests — mergear S2 antes bloquearía `test:coverage` en rojo hasta que
lleguen. S1 y S3 no tienen esa dependencia y pueden ir en cualquier
orden respecto a la Ola 1.

## acceptance

- Los cuatro umbrales globales de `vitest.config.ts` están a
  `medida − 0,5` de la cobertura real medida en la sesión que
  implementa S1 (no de la cifra de este informe, remedida en vivo).
- `branches ≥ 80%` exigido específicamente para
  `packages/core/src/lib/plugins`, `packages/core/src/lib/dry-run` y
  `packages/core/src/lib/project`.
- `bun run test:coverage` sale en verde contra los nuevos umbrales en
  HEAD.
- El trinquete de S3 falla (exit 1) si se ejecuta tras una suite verde
  cuyo `coverage-summary.json` mejora la cobertura pero
  `vitest.config.ts` no se actualizó.

## risks and mitigations

- **Riesgo: apretar los umbrales globales antes de que la Ola 1 añada
  sus tests de error bloquea `validate` para todo el equipo.**
  Mitigación: S1 se mide y aprieta contra el estado real en el momento
  de implementarlo (no contra una cifra vieja), así que por
  construcción pasa en verde el día que se aplica.
- **Riesgo: el umbral por paquete de S2 es demasiado agresivo si algún
  fichero de esos tres módulos tiene ramas genuinamente
  inalcanzables en test (p. ej. manejo de señales del SO).**
  Mitigación: el gate de S2 se prueba en vivo antes de mergear
  (rebajar deliberadamente un fixture y confirmar el fallo, luego
  revertir); si algún fichero concreto resulta inalcanzable al 80%,
  se documenta la excepción explícita en `notes` de la implementación,
  no se baja el umbral global del módulo.
- **Riesgo: `coverage-ratchet.script.ts` (S3) se vuelve una segunda
  fuente de verdad que diverge de `vitest.config.ts` si alguien edita
  uno sin el otro.** Mitigación: el script no mantiene su propio
  estado — lee `vitest.config.ts` como fuente y sólo compara/escribe
  ahí, igual que `type-naming.script.ts --update` reescribe su propio
  baseline en vez de mantener un valor paralelo.

## notes

Esta propuesta no reproduce las cifras exactas de cobertura del
informe (82,27/69,04/82,94/83,94) como hechos verificados — se
remiten explícitamente a remedición en S1, siguiendo la misma
disciplina que el propio hallazgo pide para el trinquete ideal
("medida − 0,5", no un número heredado de un informe anterior).

Ficheros de referencia:

- `vitest.config.ts:75-129`
- `docs/mcp-vertex/proposals/ready/chores/c00157-i-prefix-exported-types-interfaces-ratchet.md`
  (idioma de baseline/ratchet copiado)
- `tools/scripts/lint/type-naming.script.ts` (idioma de `--update`)

2026-09-02 (sonnet-worker-tests-2): verified S1 and S2 were already
implemented — `vitest.config.ts`'s `coverage.thresholds` block already
has the four global floors at `82/69/83/83` (its own "RATCHET POLICY"
comment, dated 2026-08-29, documents the exact re-measurement:
83.30/70.34/84.12/84.98, floored to `measured − 1.0`) and the three
per-module `branches: 80` glob overrides for
`packages/core/src/lib/plugins/**`, `packages/core/src/lib/dry-run/**`
and `packages/core/src/lib/project/**`. Did not re-run
`bun run test:coverage` (full suite, shared machine, out of scope for
this closing pass) — the in-repo comment's own re-measurement already
satisfies S1's "medida en vivo" requirement more recently than this
proposal's audit snapshot, and the numbers in `vitest.config.ts` match
what the comment claims.

Wrote the missing S3: `tools/scripts/coverage-ratchet.script.ts` +
`tools/scripts/coverage-ratchet.script.spec.ts` (9 tests, all
passing) — a pure `computeCoverageRatchetViolations` compares
`vitest.config.ts`'s parsed global thresholds against a fresh
`coverage-summary.json` and flags any metric where
`configured < floor(measured − 1.0)`, plus `package.json`'s new
`coverage:ratchet` script (`vitest run --coverage
--reporter=json-summary && coverage-ratchet.script.ts`, not wired into
`validate` per the proposal's own S3 file note: "no bloquea validate
... si el runtime de test:coverage completo es costoso"). Ran the
script standalone with no report present — it fails closed with a
clear message instead of silently passing, per the acceptance
"exit 1" requirement. `npx tsc -p tools/tsconfig.json --noEmit`,
`bun run lint:referenced-scripts-exist`, `bun run
lint:json-entry-collision` all clean.
