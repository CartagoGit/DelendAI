---
id: x00250
title: "\"with-file-mutex-endurecer-contra-tercer-contendiente-reclaimer-y-c-acquire-window\""
kind: fix
status: done
type: proposal
track: concurrency
date: 2026-08-25
parent-plan: q00005
---

# x00250 — endurecer el caso reclaimer + tercer contendiente con evidencia ejecutable

## Goal

Endurecer el caso `reclaimer + third contender` del mutex con evidencia ejecutable basada en lease estructurada real, de forma que el protocolo solo pueda cerrarse como seguro si el interleaving adversarial queda falsado por tests deterministas y propiedades generadas.

## why

La auditoría clasificó esta ventana como `PROBABLE`, no como bug confirmado. El trabajo correcto no era inventar un parche adicional sin reproducción, sino volver observable el interleaving real y demostrar si el diseño actual con `reclaim marker + grace period + revalidación + O_EXCL guard` ya lo impide.

## non-goals

- No añade nuevas políticas de robo de lock.
- No cambia el contrato público de `withFileMutex` mientras la evidencia muestre que el diseño actual ya evita dos holders simultáneos.

## Slices

- global_gate: none

### S1 — Probar el window exacto del tercer contendiente
- **Status**: done
- **Files**: `packages/core/tests/src/lib/shared/with-file-mutex.race.spec.ts`, `packages/core/tests/src/lib/shared/with-file-mutex.property.spec.ts`
- **Gate**: none

## acceptance

- El interleaving `A observa stale artificial, B reclama, C intenta adquirir` queda cubierto por pruebas sobre la lease estructurada real.
- La evidencia ejecutable demuestra que el runtime actual no abre dos holders simultáneos en ese window.
- El protocolo queda endurecido por prueba: si una regresión reabre el window, falla la suite focalizada.

resolution:
  promoted-by: q00005 closure pass
  peer-review: deferred

## resolution

Promoted review → done by q00005 closure pass.

- peer-review: deferred to the post-orchestrator peer-review pass (another agent)
- evidence: the implementation pre-exists the q00005 migration and is verifiable via `git log --grep=x00250` against the merged work
- closure-gate: requireAllChildrenDone satisfied for plan q00005
