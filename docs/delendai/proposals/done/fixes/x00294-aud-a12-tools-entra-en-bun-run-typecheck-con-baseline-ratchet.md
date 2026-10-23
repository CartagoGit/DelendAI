---
id: x00294
title: "AUD-A12 — tools/ entra en bun run typecheck, con baseline-ratchet"
kind: fix
status: done
type: fix
track: ci
date: 2026-08-27
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-A12
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P1
related: [q00011, x00295]
---

# x00294 — `tools/` entra en `bun run typecheck`, con baseline-ratchet

## Goal

Hacer que `bun run typecheck` cubra `tools/**` — 303 ficheros / 56.143
líneas: todos los lints, generadores, verificadores y scripts de CI del
repositorio — sin bloquear `validate` con los errores que ya existían
antes de este cambio, y sin poder volver a perder cobertura de la misma
forma en el futuro sin que un test lo note.

## Why

`bun run typecheck` ejecuta `tsc --noEmit -p tsconfig.json`, un único
proyecto cuyo `include` no contiene `tools/**`. Existe un
`tools/tsconfig.json` que sí lo cubriría — y nada lo invocaba:

```
$ grep -rn "tools/tsconfig" package.json .github/workflows/ tools/scripts/ lefthook.yml
(sin resultados)

$ bunx tsc --noEmit -p tools/tsconfig.json 2>&1 | grep -c "error TS"
95
```

Repartidos en 29 ficheros. `tools/tsconfig.json` además sólo incluía
`scripts/**`: `tools/tests/**` —donde viven los specs de los
verificadores de CI (`verify-branch-protection.spec.ts`,
`verify-develop-health.spec.ts`, etc.)— no lo cubre ningún proyecto de
TypeScript.

Cuatro de esos 95 errores son `TS2367`: comparaciones que el compilador
demuestra siempre falsas. Una de ellas — en
`tools/scripts/verify/verify-probes.ts` — es un fallo de seguridad real
en el arnés `verify:tools` (`x00295`, `AUD-D07`). Nadie lo vio porque
`tools/` no se typechecaba. Ese es el impacto concreto de este hallazgo:
no es sólo "faltan 95 avisos de tipos", es "el compilador ya había
encontrado el bug de `AUD-D07` y no había ningún canal para que alguien
lo leyera".

## Why this design

La solución arquitectónica ideal —derivar los proyectos a typechequear
de `package.json#workspaces` en vez de un `include` mantenido a mano—
es la misma corrección de fondo que `AUD-A09` (alcance del lint) y
`AUD-A11` (mapa workspace↔proyecto): derivar el alcance del manifiesto,
no repetirlo a mano. Hacerla completa (referencias de proyecto de
TypeScript, descubrimiento automático de `tsconfig.json` por paquete,
invocación dinámica de `tsc` por cada uno) es un refactor mayor que el
que corresponde a este fix puntual.

Este proposal entrega la mitad barata y verificable de esa idea: un
test de cobertura que recorre `package.json#workspaces` de verdad y
falla si algún workspace con código TypeScript no está cubierto por
ningún proyecto — exactamente la forma del bug que `AUD-A12` encontró.
La derivación completa de la invocación de `tsc` queda fuera de alcance
deliberadamente.

Para los 95 (103 tras añadir `tools/tests/**`) errores preexistentes se
usa el mismo idiom de ratchet-baseline que ya vive en el repo
(`types-in-contracts.script.ts` + su baseline JSON, mismo `--update`):
un JSON de `{ fichero: cuenta }` que sólo puede bajar. Un fichero nuevo
con errores, o un fichero existente cuya cuenta sube, rompe el gate; un
fichero que baja o desaparece no lo hace, y queda como una victoria que
`--update` puede fijar.

## Non-goals

- No arreglar los 95/103 errores de tipos preexistentes en `tools/` —
  quedan registrados en la baseline y se arreglan uno a uno cuando se
  toque cada fichero.
- No implementar la derivación completa de proyectos TypeScript desde
  `package.json#workspaces` (referencias de proyecto, descubrimiento
  dinámico) — sólo el test de cobertura que la haría necesaria el día
  que falle.
- No tocar `tsconfig.json` (raíz) más allá de lo estrictamente
  necesario para que el test de cobertura lea su `include` — el
  `include` en sí no cambia.
- No arreglar `plugins/error-reporting` ni ningún fichero fuera de
  `tools/` — cualquier error ahí es de otro slice de `q00011`.

## Architecture

- `tools/tsconfig.json#include` gana `tests/**/*.ts` (antes sólo
  `scripts/**`), para que `tools/tests/**` — los specs de los
  verificadores de CI, entre otros — entre también al alcance.
- `tools/scripts/typecheck.script.ts` (el mismo wrapper que ya invoca
  `tsc -p tsconfig.json` para el proyecto raíz) añade un segundo paso:
  tras el proyecto raíz (que sigue siendo tolerancia cero, sin
  baseline), corre `tsc -p tools/tsconfig.json`, parsea la salida por
  fichero (`parseTscErrorsByFile`), y aplica el ratchet contra
  `tools/tsconfig.baseline.json` (`computeToolsRegressions`,
  mismo criterio que `types-in-contracts.script.ts`: cuenta actual >
  cuenta baseline ⇒ regresión). `--update` reescribe la baseline a los
  conteos actuales.
- Como `bun run typecheck` en `package.json` ya invoca
  `typecheck.script.ts`, y el job `typecheck` de `.github/workflows/ci.yml`
  ya invoca `bun run typecheck`, ninguno de los dos necesita un paso
  nuevo — la cobertura de `tools/` queda dentro del mismo comando que
  ya existía.
- `tools/scripts/typecheck.script.ts` añade además
  `readWorkspaceGlobs` / `expandWorkspaceGlob` / `dirHasTsFiles` /
  `isCoveredByTsProject` / `findUncoveredWorkspaces`: funciones puras,
  exportadas, que un test (`tools/scripts/typecheck.spec.ts`) ejecuta
  contra el `package.json` y el `tsconfig.json` reales del repo.

## Slices

### S1 — `tools/tsconfig.json` cubre `tools/tests/**`

- **Status**: done
- **Files**: `tools/tsconfig.json`
- **Gate**: `bunx tsc --noEmit -p tools/tsconfig.json` (el conteo de errores puede subir respecto a antes de este slice, se registra en S2)

### S2 — ratchet-baseline de `tsc -p tools/tsconfig.json` dentro de `typecheck.script.ts`

- **Status**: done
- **Files**: `tools/scripts/typecheck.script.ts`, `tools/tsconfig.baseline.json`
- **Gate**: `bun tools/scripts/typecheck.script.ts` (verde con la baseline actual); `bun tools/scripts/typecheck.script.ts --update` reescribe la baseline sin cambiar el conteo real

### S3 — test de cobertura workspace↔proyecto

- **Status**: done
- **Files**: `tools/scripts/typecheck.spec.ts`
- **Gate**: `bunx vitest run --project tools -- tools/scripts/typecheck.spec.ts`

## Dependency graph

```
S1 ──► S2 ──► S3
```

S2 necesita que S1 haya fijado el `include` final antes de congelar la
baseline (si no, el primer `--update` post-S1 quedaría corto). S3 lee
`tsconfig.json` (raíz) y `tools/tsconfig.json` tal como quedan tras S1,
así que corre en último lugar.

## Acceptance

1. `bun run typecheck` ejecuta también `tsc -p tools/tsconfig.json` y
   falla si aparece un error NUEVO (fichero fuera de la baseline, o
   fichero cuya cuenta sube).
2. La baseline arranca en el conteo real medido en este slice (ver
   Notes) y sólo puede bajar sin intervención manual del flag
   `--update`.
3. `tools/tests/**` está incluido en algún proyecto de TypeScript.
4. El test de cobertura (`tools/scripts/typecheck.spec.ts`) falla si se
   simula un workspace con TypeScript no cubierto por ningún proyecto,
   y pasa contra el manifiesto real del repo.
5. `bun run validate` no se rompe por este cambio salvo que introduzca
   type errors nuevos en `tools/`.

## Risks and mitigations

| Riesgo | Mitigación |
| --- | --- |
| La baseline se usa para esconder regresiones reales | `--update` deja rastro en el diff del PR (`git diff tools/tsconfig.baseline.json`); un revisor ve exactamente qué ficheros bajaron o subieron |
| El heurístico de cobertura (`isCoveredByTsProject`) da falsos negativos con patrones `include` más exóticos que los actuales | El test corre contra el manifiesto real hoy y pasa; si un patrón nuevo lo rompe, se ajusta el heurístico en el mismo slice que lo introduce, no por adelantado |
| Otro agente concurrente modifica `plugins/error-reporting` mientras este slice mide errores | El scope de S1–S3 es exclusivamente `tools/`; un error transitorio fuera de `tools/` no forma parte de la baseline de este proposal |

## Notes

- Medido en este slice: `bunx tsc --noEmit -p tools/tsconfig.json`
  daba **95** errores en 29 ficheros con el `include` original
  (`scripts/**` únicamente). Al añadir `tests/**/*.ts` (S1) subió a
  **103** errores en 33 ficheros — la diferencia son los specs de
  `tools/tests/**`, antes invisibles del todo para cualquier proyecto
  de TypeScript. Arreglar `no-internal-imports.script.ts` en el mismo
  slice que `x00295` (ver su nota adyacente) bajó la baseline final a
  **97** errores en 32 ficheros — ese descenso quedó fijado con
  `--update`.
- La solución arquitectónica ideal (derivar `tsc -p <proyecto>` por
  cada entrada de `workspaces`) no se implementó completa; sólo el test
  de cobertura. Queda como candidato a un refactor futuro si
  `AUD-A09`/`AUD-A11` avanzan en la misma dirección y conviene
  unificar los tres.
