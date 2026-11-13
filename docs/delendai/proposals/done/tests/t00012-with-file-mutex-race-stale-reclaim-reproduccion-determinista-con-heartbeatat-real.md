---
id: t00012
title: "\"with-file-mutex-race-stale-reclaim-reproduccion-determinista-con-heartbeatat-real\""
kind: test
status: done
type: proposal
track: concurrency
date: 2026-08-25
parent-plan: q00005
---

# t00012 — reproducción determinista con heartbeatAt real

## Goal

Rehacer la suite de race/reclaim del mutex para que la condición de staleness use la lease estructurada real (`heartbeatAt`) en vez de `mtime`, y demostrar que el reclaimer entra de verdad en la ruta `observe stale` antes de abortar por heartbeat nuevo.

## why

Tras `x00244`, el protocolo ya no decide stale por `mtime`. Los tests heredados que tocan `utimesSync()` podían pasar sin recorrer el camino real del código, dejando el guard del reclaim sin evidencia útil.

## non-goals

- No cambia la semántica pública de `withFileMutex`.
- No introduce nuevas políticas de contención; solo corrige la fidelidad de la prueba al protocolo real.

## Slices

- global_gate: none

### S1 — Reescribir los repros con lease estructurada
- **Status**: done
- **Files**: `packages/core/tests/src/lib/shared/with-file-mutex.race.spec.ts`, `packages/core/tests/src/lib/shared/with-file-mutex-reclaim.spec.ts`
- **Gate**: none

## acceptance

- Los tests de race/reclaim construyen sidecars JSON con `heartbeatAt` stale real.
- La ruta `afterObserveStale` se ejecuta y la renovación posterior actualiza `generation` y `heartbeatAt`, no `mtime`.
- Si se elimina la revalidación de lease en runtime, la prueba deja de proteger el interleaving que pretende modelar.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the implementation pre-exists the q00005 migration and is verifiable via `git log --grep=t00012` against the merged work
- closure-gate: requireAllChildrenDone satisfied for plan q00005
