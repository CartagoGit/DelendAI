---
id: x00282
title: "Mapa único workspace→proyecto vitest: affected.script.ts deja de emitir nombres que --project rechaza"
kind: fix
status: done
type: proposal
track: ci
date: 2026-08-29
priority: P1
related:
    - q00011
    - x00281 # biome baseline — mismo tier1/affected-lint, propuesta hermana en AUD-A09/A11
shipped-in:
    - 0e61564 # S1 resolveVitestProjectName + S2 mapa de integración + S3 cableado tier1
---

# x00282 — Mapa único workspace→proyecto vitest

## Goal

`affected.script.ts` deja de emitir `pkg.name` (`@mcp-vertex/core`)
como identificador de "workspace afectado" y en su lugar emite el
`name` real declarado en el `vitest.config.ts` de cada workspace, con
fallback a `pkg.name` cuando ese workspace no declara un nombre corto.
`tier1.yml`/`affected-tests` consume el nombre correcto y `vitest run
--project <nombre>` deja de fallar con `No projects matched the
filter`.

## why

Reproducido en vivo en esta sesión (2026-08-29), no solo leído del
código:

```
$ bunx vitest run --project '@mcp-vertex/core'
⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
Error: No projects matched the filter "@mcp-vertex/core".

$ bunx vitest run --project 'core'      # funciona
```

Y confirmando los dos espacios de nombres reales del repo:

```
$ grep -n "name:" packages/core/vitest.config.ts plugins/git/vitest.config.ts
packages/core/vitest.config.ts:19:   name: 'core',
plugins/git/vitest.config.ts:18:    name: 'git',
```

`affected.script.ts` construye el conjunto afectado a partir de
`pkg.name` de cada `package.json` (`@mcp-vertex/core`,
`@mcp-vertex/git`, …) — el mismo identificador que usa para el grafo
de dependencias internas, que es el uso correcto para *ese* propósito.
Pero `.github/workflows/tier1.yml`, job `affected-tests`, pasa
exactamente esos nombres a `vitest run --project <ws>`, y Vitest
identifica proyectos por el `name:` de su config, que en varios
workspaces es corto (`core`, `git`, `project-health`, …) y solo
coincide por accidente con el nombre de paquete cuando el
`vitest.config.ts` no declara un `name` propio (p. ej.
`@mcp-vertex/cli`).

Confirmado también el segundo síntoma que describe la auditoría — el
job real ejecuta la suite completa en vez de un subconjunto: con un
`.affected-set` no vacío que contiene al menos un nombre corto, el
bucle `while IFS= read -r ws; do PROJECTS="${PROJECTS} --project
${ws}"` termina generando una invocación con nombres inválidos, así
que el paso falla por completo (no "cae en el `else`" del fallback —
ese fallback solo se activa cuando `build/ci/.affected-set` está
**vacío**, no cuando contiene nombres inválidos). En cualquiera de los
dos casos el gate rápido no cumple su contrato documentado
("per-PR feedback loop under a minute").

## why this design

La opción mínima —traducir cada nombre en el propio workflow YAML con
un `sed`/mapa hardcodeado— reintroduce exactamente la clase de bug que
causó esto: una segunda fuente de verdad para la misma correspondencia
que puede volver a divergir en cuanto se añada un workspace. La
solución vive en `affected.script.ts` porque es el único punto que ya
recorre todos los workspaces y ya lee sus `package.json`; añadirle la
lectura del `vitest.config.ts` correspondiente es una extensión local,
no una arquitectura nueva.

Se descarta la "solución arquitectónica ideal" completa que sugiere la
auditoría (un artefacto generado `workspace-project-map.json` con
drift check en `check:generated`) para esta propuesta por ser mayor
alcance del necesario para cerrar el bug — queda anotada en "notes"
como extensión futura si el mapa vuelve a divergir por otra vía (p. ej.
un generador de scaffolding que no pase por `affected.script.ts`).

## non-goals

- **Un artefacto generado versionado con drift check.** Ver "why this
  design" — se resuelve en el propio script que ya construye el
  conjunto afectado, sin nuevo artefacto en disco.
- **Cambiar cómo Vitest resuelve `--project`.** Es comportamiento de
  Vitest, no de este repo.
- **Renombrar los `vitest.config.ts` existentes** para que su `name`
  coincida con `pkg.name`. Sería un cambio más invasivo (afecta a
  cualquier invocación manual `--project` que ya use el nombre corto)
  sin resolver el problema de fondo (la próxima vez que alguien añada
  un workspace con nombre corto, volvería a divergir).
- **`lint:referenced-scripts-exist`** ni otros lints de AUD-A08 — fuera
  de alcance.

## architecture

`tools/scripts/ci/affected.script.ts` añade una función
`resolveVitestProjectName(dir, pkgName)`:

1. Busca `<dir>/vitest.config.ts` (o `.mts`/`.js` si existiera).
2. Si existe y contiene una clave `name: '<algo>'` en el nivel
   `test.name` o `defineProject({ test: { name: ... } })`, usa ese
   valor (parseo regex simple, en línea con el resto de scripts de
   `tools/`, no un parser de AST — el mismo patrón que ya usa
   `expandWorkspaces`/`dirToName` en el propio fichero).
3. Si no hay `vitest.config.ts` o no declara `name`, usa `pkg.name`
   (comportamiento actual, que ya es correcto para esos casos —
   p. ej. `@mcp-vertex/cli`).

El `IAffectedResult` (o el tipo equivalente que ya usa el script) gana
un segundo campo `vitestProjects: readonly string[]` junto al
`affected: readonly string[]` existente (que sigue siendo `pkg.name`,
usado para el grafo de dependencias y cualquier otro consumidor que sí
quiera el nombre de paquete). `--set-file` sigue escribiendo
`affected` para compatibilidad; se añade `--vitest-set-file <path>`
para el segundo conjunto.

`tier1.yml`/`affected-tests` cambia de leer `build/ci/.affected-set` a
leer el nuevo `build/ci/.affected-vitest-set`, sin tocar el resto del
job.

## Slices

### S1 — `resolveVitestProjectName` + segundo conjunto emitido

- **Status**: done
- **Files**:
    - `tools/scripts/ci/affected.script.ts`
    - `tools/scripts/ci/affected.script.spec.ts`
- **Gate**: `bunx vitest run --project tools -- affected.script.spec`
- review-state: done
- review-implementer: owl
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificación independiente en el checkout actual: resolveVitestProjectName resuelve por workspace desde vitest.config con fallback a pkg.name; affected.json añade vitestProjects y el CLI emite el set paralelo vía --vitest-set-file; el set existente de paquetes se preserva. Prueba focalizada tools/scripts/ci/affected.script.spec.ts verde y sin bloqueadores fuera del slice para esta aprobación.
### S2 — Test de integración: cada workspace resuelve a un proyecto vitest real

- **Status**: done
- **Files**:
    - `tools/scripts/ci/affected.script.spec.ts` (nuevo caso, o fichero
      hermano `tools/scripts/ci/affected-vitest-project-map.spec.ts`)
- **Gate**: `bunx vitest run --project tools -- affected-vitest-project-map`
  — el spec recorre `expandWorkspaces` sobre el repo real y, para cada
  workspace, invoca `bunx vitest list --project <nombre-emitido>` (o
  equivalente) y falla si Vitest no reconoce ese nombre. Este test
  falla **hoy** contra el código actual — es la prueba de que sirve.
- review-state: done
- review-implementer: crow
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificación independiente en el checkout actual: tools/scripts/ci/affected-vitest-project-map.spec.ts recorre el grafo real de workspaces, lo cruza con los patterns de projects del vitest root, filtra workspaces con vitest.config y valida los mapeos reales core→core, git→git y fallback de @mcp-vertex/cli. Suite focal requerida verde (affected.script.spec.ts + affected-vitest-project-map.spec.ts). Hay cambios no relacionados en el checkout global, pero no bloquean esta aprobación porque no intersectan el surface revisado más allá de S1 ya aprobado y la metadata de la propuesta.
### S3 — Cablear `tier1.yml`/`affected-tests` al nuevo conjunto

- **Status**: done
- **Files**:
    - `.github/workflows/tier1.yml` (job `affected-tests`)
- **Gate**: cambiar solo `plugins/git/**` en una rama local y correr
  `bun tools/scripts/ci/affected.script.ts --base develop --head HEAD
  --set-file /tmp/a.set --vitest-set-file /tmp/a.vitest.set && cat
  /tmp/a.vitest.set` → debe imprimir `git` (no `@mcp-vertex/git`), y
  `bunx vitest run --project $(cat /tmp/a.vitest.set)` debe ejecutar
  solo los specs de `git`.
- review-state: done
- review-implementer: sparrow
- review-reviewer: falcon_review
- review-log: requested_changes by delivery_verifier — Revisión independiente en el checkout actual: .github/workflows/tier1.yml parsea como YAML y affected-tests sí lee build/ci/.affected-vitest-set con fallback a bunx vitest run cuando el set está vacío. Pero detect-affected no cumple aún el criterio del artifact: en el bloque upload-artifact, la línea de build/ci/.affected-vitest-set quedó con sangría extra dentro de path: |, así que YAML la conserva con espacios líderes y el artifact intentará subir una ruta distinta a build/ci/.affected-vitest-set. Además, la nueva opción --vitest-set-file en el comando también quedó sobreindentada, aunque ahí el shell la sigue aceptando por whitespace. Cambios fuera del slice revisado: hay metadata de la propuesta y un spec no trackeado de S2; no bloquean por sí solos esta revisión. Bloqueador real de S3: criterion (1) no satisfecho en .github/workflows/tier1.yml actual.
- review-log: approved by falcon_review — Verificación independiente de segunda ronda sobre el checkout actual: el bloque path de upload-artifact lista build/ci/affected.json, build/ci/.affected-set y build/ci/.affected-vitest-set con la misma sangría; affected-tests consume build/ci/.affected-vitest-set y hace fallback a bunx vitest run cuando el archivo no existe o está vacío; el diff del workflow queda limitado a las dos correcciones de sangría esperadas, sin cambios adicionales en otros jobs.
## dependency graph

S1 es la base; S2 depende de S1 (necesita el campo nuevo para poder
fallar/pasar de forma significativa) y se escribe **antes** de
verificar que pasa, siguiendo el mismo principio que `t00029` en el
plan madre: un test que primero demuestra el bug y luego confirma el
arreglo. S3 depende de S1 y S2 en verde. Independiente del resto de
`q00011` (marcado como tal en su dependency graph: "x00282
(independiente)").

## acceptance

1. Para **cada** workspace declarado en `package.json#workspaces`, el
   nombre que emite `affected.script.ts --vitest-set-file` es aceptado
   por `vitest run --project <nombre>` sin `No projects matched`.
   Verificado por un test que recorre la lista real, no una lista
   hardcodeada (S2).
2. Cambiando solo `plugins/git/**`, `tier1.yml`/`affected-tests`
   ejecuta los specs de `git` y **no** los de `core`, demostrado en el
   log del job (número de tests ejecutados > 0 y < el total de la
   suite completa).
3. `bun tools/scripts/lint/proposals.script.ts` sin errores ni
   warnings sobre este fichero.

## risks and mitigations

- **Riesgo: el parseo regex de `vitest.config.ts` no cubre una forma
  exótica de declarar `name`** (p. ej. una variable indirecta en vez
  de un string literal). Mitigación: fallback silencioso a `pkg.name`
  cuando el regex no encuentra un match — nunca peor que el
  comportamiento actual, solo mejor cuando el patrón simple (que es lo
  que usan todos los `vitest.config.ts` de este repo hoy) aplica.
- **Riesgo: un nuevo workspace añade un `vitest.config.ts` con `name`
  corto y nadie corre el test de S2.** Mitigación: S2 es parte de
  `bun run test`, que ya corre en cada PR vía `ci.yml`/`tests` — no es
  un chequeo opcional aparte.
- **Riesgo: cambiar el fichero que lee `tier1.yml` rompe una
  invocación manual existente que usaba `.affected-set`.** Mitigación:
  `.affected-set` (nombres de paquete) se sigue escribiendo sin
  cambios; solo se añade un fichero nuevo, no se elimina el existente.

## notes

Si en el futuro aparece un tercer consumidor de "workspace → nombre" (
p. ej. un generador de scaffolding, o `tools/tsconfig.json` per
AUD-A12/`x00294`) que también necesite esta correspondencia, vale la
pena revisar la "solución arquitectónica ideal" completa de la
auditoría: un artefacto generado único
`build/ci/workspace-project-map.json` con drift check en
`check:generated`, que sería la fuente compartida en vez de que cada
consumidor la derive por su cuenta. Por ahora, con un único consumidor
real (`tier1.yml`), resolverlo en `affected.script.ts` es suficiente y
más barato.

Comandos de reproducción usados en esta sesión (2026-08-29):

```
$ bunx vitest run --project '@mcp-vertex/core'
Error: No projects matched the filter "@mcp-vertex/core".
$ bunx vitest run --project '@mcp-vertex/git'
Error: No projects matched the filter "@mcp-vertex/git".
$ grep -n "name:" packages/core/vitest.config.ts plugins/git/vitest.config.ts
packages/core/vitest.config.ts:19:    name: 'core',
plugins/git/vitest.config.ts:18:     name: 'git',
```
