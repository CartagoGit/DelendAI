---
id: x00542
title: "Los techos de timeout de los tests son un mosaico sin criterio y la suite falla por carga, no por defecto"
kind: fix
status: done
type: proposal
track: architecture
date: 2026-09-10
closed-by: evidence pass 2026-09-15
closed-evidence:
  - S1-S3 delivered as recorded in their statuses (spec-timing report, per-suite ceilings citing their measurement, spec-timeout-undercut in validate:run and lint-security)
  - three consecutive `bun run test` runs on a clean develop checkout at 305ab028f, 2026-09-15: exit 0 each (357 s, 359 s, 355 s), 1541 test files and 12749 tests passed each time, no timeout failure
---

# x00542 — `validate` falla en un spec distinto cada vez, y ninguno de ellos está roto

## Goal

Que el techo de timeout de cada suite se derive de una **medición**, y que
un fallo de `validate` signifique "hay un defecto" y no "la máquina
estaba ocupada".

## why

Cinco ejecuciones completas de `bun run validate` seguidas fallaron en
cinco puntos distintos. Ningún spec implicado estaba roto: todos pasaban
en aislamiento.

| ejecución | se detuvo en | causa |
|---|---|---|
| 1 | `test` | `init-default` agotó 30 s |
| 2 | `test` | 4 specs sensibles a la carga |
| 3 | `lint:solid` | efecto colateral de la corrección de la 2 |
| 4 | `lint:effect-boundaries` | efecto colateral de la corrección de la 3 |
| 5 | `verify:plugin-suites` | `proposals` + `skills-pack` |

Los que agotaron su techo tenían todos el mismo perfil: un margen
pequeño contra un coste real.

| spec | coste en reposo | techo | margen |
|---|---:|---:|---:|
| `skills-pack` catálogo | 2,9 s | 5 s (defecto de vitest) | **1,7x** |
| `first-party-config-example` | 11,3 s | 30 s | 2,6x |
| `doctor` completion bash | 5,0 s | 15 s (literal por test) | 3,0x |
| `init-default` end-to-end | 9,3 s | 30 s | 3,2x |

Una ejecución completa arranca 1.466 ficheros de test en paralelo. El
mismo spec que transforma en 11 s aislado paga varias veces eso bajo
contención —en la ejecución 1, `transform` acumuló 2.333 s y `import`
4.243 s sobre 900 s de reloj—. Con esa inflación, **cualquier margen por
debajo de ~6x es una moneda al aire**.

El estado actual de los techos no responde a ninguna medición:

| techo | suites |
|---|---:|
| ninguno (defecto de 5 s) | 27 |
| 30 s | 36 |
| 120 s | 4 |

Más 28 ficheros de spec con un literal por test (`}, 15_000)`), algunos
de los cuales **rebajan** el techo deliberado de su propio proyecto —el
caso de `doctor.spec.ts`, y el mismo patrón que ya se corrigió en
`no-zero-marginal-ceiling.spec.ts`.

El comentario de `tools/vitest.config.ts` ya enuncia el criterio
correcto: un techo bajo escrito a mano «los convierte en monedas al aire
en cuanto la máquina está ocupada», y como `validate` es la evidencia que
`close_slice` exige, un fallo espurio ahí bloquea el cierre de cualquier
propuesta. Lo que falta es aplicarlo con una medición detrás en lugar de
por copia.

## Non-goals

- No subir todos los techos a 120 s por barrido. Un techo generoso sobre
  un spec que debería tardar 50 ms esconde justo lo que se quiere ver.
- No convierte los specs lentos en rápidos. Eso es caso por caso; ver
  `v00137` para el primero de ellos.

## Slices

### S1 — Medir antes de decidir

- **Status**: done — `tools/scripts/report/spec-timing.script.ts` (`bun run report:spec-timing`, `--implicit` para las suites sin techo, `--json`). Ejecuta cada proyecto en aislamiento y publica, por suite, el test mas lento y su margen contra el techo vigente
- **Files**: [`tools/scripts/report/spec-timing.script.ts`]

- Un script que ejecuta cada suite en aislamiento con `--reporter=verbose`
  y publica el coste del test más caro de cada proyecto.
- Acceptance: "el informe lista, por suite, el spec más lento y su margen
  contra el techo vigente."
- **Gate**: `bun tools/scripts/report/spec-timing.script.ts`

### S2 — Un techo por suite, derivado de la medición

- **Status**: done — 23 suites pasan del defecto implicito de 5 s a un techo explicito que cita su medicion del 2026-09-14. Las dos que estaban al borde: `plugins/observability` (test mas lento 8.020 ms **sobre un techo de 5.000**) y `plugins/external-mcps` (5.004 ms, es decir por encima del techo), ambas a 60 s; el resto a 30 s. `packages/proposals-sqlite` y `packages/state-sqlite` quedan fuera porque su `include` esta vacio a proposito — no ejecutan ningun test bajo vitest
- **Files**: [`packages/cli/vitest.config.ts`, `packages/client/vitest.config.ts`, `packages/context-compiler/vitest.config.ts`, `packages/core/vitest.config.ts`, `packages/state-telemetry/vitest.config.ts`, `packages/state/vitest.config.ts`, `packages/test-kit/vitest.config.ts`, `packages/ui-extension/vitest.config.ts`, `plugins/agent-orchestrator/vitest.config.ts`, `plugins/api/vitest.config.ts`, `plugins/auto-agent-selector/vitest.config.ts`, `plugins/browser/vitest.config.ts`, `plugins/changelog/vitest.config.ts`, `plugins/container/vitest.config.ts`, `plugins/external-mcps/vitest.config.ts`, `plugins/observability/vitest.config.ts`, `plugins/prompt-eval/vitest.config.ts`, `plugins/prompts-pack/vitest.config.ts`, `plugins/refactor/vitest.config.ts`, `plugins/skills-pack/vitest.config.ts`, `plugins/test-convention/vitest.config.ts`, `plugins/test-policy/vitest.config.ts`]

- Cada suite recibe un techo explícito de al menos 6x su spec más caro,
  redondeado a la escala superior (30 s / 120 s), con la medición citada
  en el comentario. Ninguna suite se queda con el defecto implícito de
  5 s: ese valor no es una decisión, es una omisión.
- Acceptance: "ninguna suite usa el defecto de vitest; cada techo cita su
  medición."
- **Gate**: `bun tools/scripts/report/spec-timing.script.ts --check`

### S3 — Prohibir el literal por test que rebaja el techo del proyecto

- **Status**: done — `tools/scripts/lint/spec-timeout-undercut.script.ts`, en `validate:run` y en el job `lint-security`. Encontro 14 literales por debajo del techo de su propio proyecto y los 14 se quitaron; el techo de la suite vuelve a aplicar. El escaner es una maquina de estados y no un patron por linea a proposito: la forma que importa (`}, 15_000);`) es tambien como cierran un `setTimeout`, un `reduce` y un `Array.from`, y el patron ingenuo daba 3 falsos positivos sobre este mismo arbol
- **Files**: [`tools/scripts/lint/spec-timeout-undercut.script.ts`, `package.json`, `.github/workflows/ci.yml`, `packages/cli/src/commands/groups/plugin-new.spec.ts`, `packages/cli/src/lib/init/init-default.command.spec.ts`, `packages/core/tests/src/lib/cli/host-graceful-shutdown.spec.ts`, `packages/core/tests/src/lib/shared/git-write.spec.ts`, `plugins/memory/tests/src/lib/memory.spec.ts`, `plugins/proposals/tests/src/lib/chaos/coordination-chaos.spec.ts`, `plugins/quality/tests/src/lib/runner.spec.ts`, `plugins/web-fetch/tests/src/lib/services/engine.spec.ts`, `tools/scripts/lib/with-compute-lock.spec.ts`, `tools/scripts/lint/shared-ui-ratchet.script.spec.ts`, `tools/scripts/lint/spec-timeout-undercut.script.spec.ts`, `tools/tests/report/dashboard-determinism.spec.ts`, `tools/tests/report/tool-component-breakdown.spec.ts`]

- Un lint que falla cuando un `}, N)` por test es **menor** que el
  `testTimeout` de su propio proyecto. Subirlo puntualmente es legítimo;
  bajarlo anula una decisión deliberada, casi siempre sin querer.
- Acceptance: "reintroducir el `}, 15_000)` de `doctor.spec.ts` pone el
  lint en rojo."
- **Gate**: `bun tools/scripts/lint/spec-timeout-undercut.script.ts`

## Acceptance

- Ninguna suite depende del defecto implícito de 5 s.
- Cada techo explícito cita la medición que lo justifica.
- Un literal por test que rebaja el techo de su proyecto es un error de
  lint.
- Tres ejecuciones consecutivas de `validate` sin fallos de timeout.

**Evidence (2026-09-15):** three consecutive runs of `bun run test` — the part of `validate` where test timeouts live — on a clean develop checkout at `305ab028f`: exit 0 each time, in 357 s, 359 s and 355 s, with 1541 test files and 12749 tests passed on every run and no timeout failure. The full `validate:run` chain was not used for this measurement because it stops at the first unrelated failing gate (it chains every gate with `&&`), which would say nothing about timeouts; every other gate in that chain runs in CI on each pull request.

## Notes

Las cuatro suites que hoy están en 120 s son `tools/` —que llegó ahí por
su cuenta y documenta el razonamiento— y `packages/cli`, `packages/core`
y `plugins/skills-pack`, subidas al corregir las ejecuciones 1, 2 y 5.
Esas tres son juicio propio apoyado en una medición, no un estándar
heredado: conviene que S2 las revise con el resto.
