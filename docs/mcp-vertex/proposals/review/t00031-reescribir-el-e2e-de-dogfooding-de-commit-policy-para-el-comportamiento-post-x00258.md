---
id: t00031
title: "Reescribir el e2e de dogfooding de commit-policy para el comportamiento post-x00258"
kind: test
status: review
type: proposal
track: testing
date: 2026-08-29
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-F02
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P1
related: [q00011]
last-transition-id: f2ab4db3-1f0f-4268-a162-55ef1982a9e2
last-correlation-id: f2ab4db3-1f0f-4268-a162-55ef1982a9e2
last-transition-from: in-progress
---

# t00031 — Reescribir el e2e de dogfooding de `commit-policy`

## Goal

Reescribir `plugins/commit-policy/tests/src/e2e/dogfood.spec.ts:77`
—desactivado con `it.skip` desde que `x00258` cambió el
comportamiento de push directo, y nunca vuelto a escribir— para que
cubra de nuevo el camino completo commit + trailer de auditoría +
push, adaptado al comportamiento real vigente hoy, más un caso nuevo
que verifique el rechazo de push directo a rama protegida.

## why

**Comportamiento verificado y reproducido en vivo en esta sesión** (no
sólo leído del informe). El test marcado `it.skip` en la línea 77
pushea a la rama `topic/e2e-test` (no protegida) y luego comprueba:

```ts
const remoteLog = await git(remote, 'log', '--oneline');
expect(remoteLog.stdout).toContain('feat(f00181): dogfood smoke');
```

Se quitó el `.skip` temporalmente y se corrió de forma aislada contra
`develop` en HEAD de esta sesión (revertido después, sin dejar el
cambio en el árbol): **el commit y el push funcionan correctamente**
—`runPushDriver` devuelve `{ ok: true, pushed: true, remote: 'origin',
branch: 'topic/e2e-test' }` y `git log --all --oneline` en el remoto
bare confirma el commit `feat(f00181): dogfood smoke` presente en la
rama `topic/e2e-test`— pero **la aserción del test falla igualmente**,
porque `git log --oneline` sin argumentos en un repositorio bare
resuelve contra `HEAD` (que apunta a `develop`, la rama por defecto
creada en el `beforeEach`), no contra la rama a la que se empujó. El
test necesitaba `git log topic/e2e-test --oneline` (o `--all`), no
`git log --oneline`.

**Esto corrige la premisa exacta del informe**, que atribuye el
`it.skip` únicamente al cambio de comportamiento de `x00258`
(bloqueo de push directo a `develop`, verificado en
`plugins/commit-policy/src/lib/services/push-driver.ts:147-152`: un
guard hardcodeado, independiente de `protectedBranches`, que rechaza
cualquier push a la rama literal `develop`). **El código bajo test ya
soporta el escenario que el test intenta cubrir** (push a una rama no
protegida tras un commit con trailer de auditoría) — el test en sí
tiene además un bug de aserción preexistente e independiente de
`x00258` (mirar el log por defecto de un repo bare en vez de la rama
concreta empujada), que habría hecho fallar el test aunque `x00258`
nunca hubiera existido. `x00258` es la razón por la que alguien puso
`.skip` y escribió esa nota en el nombre del test, pero no es la única
razón por la que, de quitarse el `.skip` sin más cambios, el test
seguiría en rojo.

**Por qué sigue siendo un problema real, aunque la causa raíz sea
distinta de la descrita.** El camino de dogfooding completo de
`commit-policy` —el plugin que escribe en el repositorio— sigue sin
cobertura e2e desde que se desactivó. El motivo (correcto o no) quedó
escrito en el nombre del test para que se viera, y no se corrigió. La
solución del informe (reescribir el test para el comportamiento
post-`x00258`, más un caso de rechazo a rama protegida) sigue siendo
la correcta — sólo cambia qué hay que arreglar dentro del test: la
aserción del log remoto, no la lógica de push en sí.

**Los otros nueve `it.skip`/`describe.skip` del repo** (verificado
por grep en esta sesión:
`plugins/proposals/tests/src/lib/orchestration.spec.ts`,
`plugins/proposals/tests/src/lib/auto-work.spec.ts`,
`plugins/proposals/tests/src/lib/proposals/executable-acceptance.spec.ts`,
`packages/core/tests/src/lib/shared/process-tree-kill.spec.ts`,
`packages/core/tests/src/lib/shared/fs-tools-windows.spec.ts`,
`packages/core/tests/src/lib/e2e/bootstrap-wire-bytes.e2e.spec.ts`,
`tools/scripts/shim-invocation.spec.ts`) no se han vuelto a auditar
uno por uno en esta sesión más allá de confirmar que existen y que
ninguno es el fichero de `commit-policy` — se toma la caracterización
del informe (condicionales de entorno legítimos: Windows-only,
Go-toolchain-only, `hasGit`/`BUN_AVAILABLE`) como plausible mientras
no se demuestre lo contrario, porque no es el objeto de esta
propuesta.

## why this design

Se reescribe el test existente en vez de borrarlo y crear uno nuevo,
para conservar el propósito original (dogfood real: git de verdad,
remoto bare de verdad, sin mocks) y el historial de por qué existe.
La corrección de la aserción (mirar la rama correcta en el remoto) es
mínima y aislada; se aprovecha la misma sesión para añadir el caso de
rechazo a rama protegida que pide el informe, porque ambos casos
comparten exactamente el mismo fixture (`workspace`/`remote` del
`beforeEach`) y sería redundante escribirlos por separado.

No se adopta todavía la "solución arquitectónica ideal" del informe
(prohibir `it.skip` sin `@skip-reason` con issue/fecha de caducidad,
extendiendo `lint:user-markers`) como parte de este slice de test:
`lint:user-markers` (`tools/scripts/lint/user-markers.script.ts`),
verificado en esta sesión, lint hoy la configuración de *status
markers* del usuario (`mcp-vertex.config.json`), un dominio
completamente distinto de "marcadores en código fuente de test" —
extenderlo a escanear `it.skip`/`describe.skip` en `.spec.ts` es un
lint nuevo, no una extensión trivial del existente, y se dimensiona
mejor como su propio slice con su propio baseline (mismo idioma que
`type-naming.script.ts`/`c00157`) que como parte de un `t00031` que
ya tiene alcance propio (reescribir un e2e).

## non-goals

- Auditar o corregir los otros nueve `it.skip`/`describe.skip` del
  repo — el informe los caracteriza como condicionales de entorno
  legítimos; esta propuesta no los toca.
- El lint que prohíbe `it.skip` sin `@skip-reason` caducable — es la
  "solución arquitectónica ideal" del hallazgo, dimensionada como
  trabajo de seguimiento (ver S3, opcional/de decisión del usuario)
  porque requiere diseñar un lint nuevo, no extender uno existente
  con un dominio distinto.
- Cambiar el comportamiento real de `push-driver.ts` — el código bajo
  test funciona correctamente; sólo el test necesita corrección.

## architecture

`plugins/commit-policy/tests/src/e2e/dogfood.spec.ts` gana:

1. El test de la línea 77 pierde `.skip` y su nombre pasa de
   `"...pushes it (x00258: skipped, pre-x00258 behavior tested
   pre-change)"` a un nombre que describe el comportamiento actual
   (sin la nota de skip obsoleta). Su aserción final cambia de
   `git(remote, 'log', '--oneline')` a
   `git(remote, 'log', 'topic/e2e-test', '--oneline')` (o `--all`),
   consistente con el resto del fixture que ya usa
   `git(workspace, 'checkout', '-q', '-b', 'topic/e2e-test')`.
2. Un test nuevo, hermano del existente "refuses to push to a
   protected branch even with onCommit=true" (línea ~172 del fichero
   actual) pero que ejercita el commit + trailer de auditoría
   completo antes del intento de push, para que el caso de rechazo
   cubra el mismo camino de dogfood real (no sólo la llamada aislada
   a `runPushDriver`).

## slices

### S1 — Corregir la aserción del test existente y reactivarlo

- **Status**: done
- **Files**:
    - `plugins/commit-policy/tests/src/e2e/dogfood.spec.ts` (línea 77
      en adelante: quitar `.skip`, renombrar el test, corregir la
      lectura del log remoto para apuntar a `topic/e2e-test`)
- **Gate**: `bunx vitest run plugins/commit-policy/tests/src/e2e/dogfood.spec.ts`

### S2 — Caso de rechazo de push directo a rama protegida en el camino de dogfood completo

- **Status**: done
- **Files**:
    - `plugins/commit-policy/tests/src/e2e/dogfood.spec.ts` (nuevo
      `it(...)` que hace commit real vía `runCommitDriver` y luego
      intenta push a `develop`/`main` vía `runPushDriver`, esperando
      `ok: false` con la razón `DIRECT_PUSH_TO_DEVELOP_NOT_ALLOWED` o
      `protectedBranches`, según la rama probada)
- **Gate**: `bunx vitest run plugins/commit-policy/tests/src/e2e/dogfood.spec.ts`

### S3 (deferred, not a slice of this proposal) — Lint `no-unconditional-skip` con caducidad declarada

Explicitly optional / "arquitectura ideal" per the `Goal` and the risk
mitigation above — not counted against S1/S2's acceptance, and spun
back out of the slice list (see `## notes`) so it does not gate this
proposal's closure the way a real, required slice would. If picked up
later it should become its own proposal:
`tools/scripts/lint/no-unconditional-skip.script.ts` (new),
`tools/scripts/lint/no-unconditional-skip.script.spec.ts` (new),
`tools/scripts/lint/no-unconditional-skip.baseline.json` (new,
baseline of the nine existing legitimate `it.skip`/`describe.skip`,
each annotated with its environment justification), `package.json`
(`lint:no-unconditional-skip` + insertion into `validate`).

## dependency graph

Sin dependencias con otras propuestas del plan (`AUD-F02` está
marcado "Dependencias: Ninguna"). Dentro de esta propuesta: S2
depende de S1 (reutiliza el mismo test reactivado como base de
fixture); S3 es independiente de S1/S2 y puede implementarse antes,
después o no implementarse — está marcado opcional en el `Goal`
porque su alcance real (diseñar un lint nuevo desde cero, no extender
`lint:user-markers`) excede lo que el hallazgo original describía como
"se extiende [el lint existente]", y merece una decisión explícita del
usuario sobre si vale la pena frente a otras prioridades P1/P2 del
plan `q00011`.

## acceptance

- `plugins/commit-policy/tests/src/e2e/dogfood.spec.ts` no tiene
  ningún `it.skip` incondicional.
- El test reactivado de S1 pasa en verde contra el comportamiento real
  vigente (commit con trailer + push a rama no protegida).
- El test nuevo de S2 confirma el rechazo de push directo a
  `develop`/rama protegida en el camino de dogfood completo (commit
  real primero, no sólo `runPushDriver` aislado).
- `bunx vitest run --project commit-policy` en verde.

## risks and mitigations

- **Riesgo: la corrección de la aserción del log remoto esconde una
  regresión real de `push-driver.ts` en vez de un bug de test.**
  Mitigación: verificado en esta sesión con `git branch -a` y
  `git log --all --oneline` contra el remoto bare real —el commit
  SÍ llega a `topic/e2e-test`; el fallo es exclusivamente de la
  aserción mirando la rama por defecto del bare (`develop`) en vez de
  la rama empujada.
- **Riesgo: S3 (lint nuevo) se posterga indefinidamente por quedar
  "opcional".** Mitigación: se deja explícitamente fuera del criterio
  de aceptación de S1/S2 (que sí son obligatorios) para no bloquear el
  cierre del hallazgo principal; se cita en `notes` para que quien
  triage el backlog decida.

## notes

Corrección respecto al informe original: `AUD-F02` atribuye el
`it.skip` únicamente al cambio de comportamiento de `x00258`. La
reproducción en vivo en esta sesión (quitar el `.skip`, correr el
test de forma aislada, inspeccionar el remoto bare con
`git branch -a`/`git log --all`) muestra que el código de push
funciona correctamente hoy y que el test tiene, además, un bug de
aserción independiente (mirar `HEAD` del bare en vez de la rama
empujada) que le habría hecho fallar aunque `x00258` nunca hubiera
cambiado nada. La solución que pide el informe (reescribir el test +
añadir el caso de rechazo) sigue siendo correcta; el diagnóstico de
"por qué" cambia.

Ficheros de referencia:

- `plugins/commit-policy/tests/src/e2e/dogfood.spec.ts:77-146`
- `plugins/commit-policy/src/lib/services/push-driver.ts:100-176`
- `tools/scripts/lint/user-markers.script.ts` (dominio distinto,
  verificado — no es una extensión trivial para S3)

2026-09-02 (sonnet-worker-tests-2): verified S1 was already done —
`dogfood.spec.ts` has no `it.skip` at all (grep confirms zero
occurrences repo-wide in this file), and the reactivated test already
reads `git(remote, 'log', 'topic/e2e-test', '--oneline')` exactly as
this proposal's S1 architecture prescribes.

A second premise in this proposal's own `## why` is also stale: it
still cites a "hardcoded `develop` guard" at
`push-driver.ts:147-152`. Read the current file — the only hardcoded
branch guard left is `branch === 'main'`
(`DIRECT_PUSH_TO_MAIN_NOT_ALLOWED`, lines ~161-168); `develop` is not
in `DEFAULT_PROTECTED_BRANCHES_V2` (only `['main']`, per
`protected-branches.ts` / c00145 "develop solo si el owner lo activa
explícitamente") and pushing to it is refused only when a caller
opts in via `protectedBranches`, via the generic `BRANCH_PROTECTED`
code. This doesn't block S2 — the proposal's own acceptance already
allows for it ("la razón `DIRECT_PUSH_TO_DEVELOP_NOT_ALLOWED` o
`protectedBranches`, según la rama probada") — but is worth recording
since the codebase moved further since this finding's snapshot.

Wrote the missing S2: a new `it` in `dogfood.spec.ts` ("commits the
full dogfood path, then refuses a direct push to develop when develop
is protected") that runs a real `runCommitDriver` commit (audit
trailer included) against `topic/e2e-test`, then calls
`runPushDriver` targeting `develop` with `protectedBranches: ['main',
'master', 'develop']` (opt-in, matching the current, non-hardcoded
design) and asserts `ok: false`, `code: 'BRANCH_PROTECTED'`, and that
the guard fired before any network call (`git branch -a` on the bare
remote never sees `topic/e2e-test`). `npx vitest run
plugins/commit-policy/tests/src/e2e/dogfood.spec.ts` → 8/8 passing;
`npx tsc -p plugins/commit-policy/tsconfig.json --noEmit` clean;
`npx vitest run plugins/commit-policy` → 320 passing / 1 pre-existing
failure (`tests/integration/cross-agent-real.spec.ts` Test 1,
unrelated to this proposal — see `t00022`'s notes, left `ready` for a
real architecture-conflict fix).

S3 (the `no-unconditional-skip` lint) was left out of the slice list
entirely — it was already marked optional/"arquitectura ideal" and
excluded from this proposal's own acceptance criteria; converted its
heading to a plain "deferred" note (see `## slices`) so it doesn't
block this proposal's `done` transition, consistent with the risk
mitigation already written above ("se cita en notes para que quien
triage el backlog decida").
