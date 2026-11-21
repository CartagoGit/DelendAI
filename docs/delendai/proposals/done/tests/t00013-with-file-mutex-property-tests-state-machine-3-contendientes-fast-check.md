---
id: t00013
title: "\"with-file-mutex-property-tests-state-machine-3-contendientes-fast-check\""
kind: test
status: done
type: proposal
track: concurrency
date: 2026-08-25
parent-plan: q00005
---

# t00013 — property tests fast-check con tres contendientes

## Goal

Añadir una propiedad generada con `fast-check` que ejecute cientos de schedules de tres contendientes y verifique la invariante `activeHolders <= 1` y la limpieza final del sidecar.

## why

Los escenarios enumerados manualmente cubren regresiones conocidas, pero no exploran suficiente combinatoria. El hallazgo de auditoría pide un guard más fuerte contra reintroducciones en mutex bajo interleavings no triviales.

## non-goals

- No reemplaza las specs dirigidas; las complementa con exploración generada.
- No convierte la suite en un fuzz test infinito ni depende de timing abierto fuera de límites acotados.

## Slices

- global_gate: none

### S1 — Generar schedules acotados de tres contendientes
- **Status**: done
- **Files**: `packages/core/tests/src/lib/shared/with-file-mutex.property.spec.ts`
- **Gate**: none

## acceptance

- La suite ejecuta una propiedad `fast-check` con tres contendientes y crashes opcionales.
- La invariante `maxConcurrent <= 1` se verifica en todos los runs generados.
- El sidecar `*.mutex` no queda colgado al terminar cada escenario generado.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the implementation pre-exists the q00005 migration and is verifiable via `git log --grep=t00013` against the merged work
- closure-gate: requireAllChildrenDone satisfied for plan q00005
