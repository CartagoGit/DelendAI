---
id: x00679
title: "A work-ref shape change keeps old units working"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [f00644, x00674]
last-transition-id: 68ac0275-fd17-4979-ae62-6f1319011339
last-correlation-id: 68ac0275-fd17-4979-ae62-6f1319011339
last-transition-from: review
shipped-in:
  - "39408361f39cbf64d929dd4a2804d9e0be02de5a"
---

# x00679 — A work-ref shape change keeps old units working

## goal

Every change of `WORK_REF_SHAPE` keeps the units written under earlier
shapes working: the current CLI enters the same unit, checkpoints onto
it and publishes it under its own name, with no rename and nothing
lost. A test proves it for every earlier shape, and a change of the
shape cannot land without recording the shape it replaces.

## why

f00644 added the kind segment, and units entered before it became
unreachable: the CLI rendered only the new name and reported them
missing (x00674, found by chance when a publication failed). An
external review (2026-09-27) asked for this to be a permanent property
of any evolution of the work-ref shape, tested against real history,
not a fix per migration.

## why this design

- **The history is a list.** `PREVIOUS_SHAPES` in the migration spec
  holds every shape a live unit may still carry. For each one, a real
  repository gets a unit under that shape, and the current CLI must
  enter it, checkpoint onto it and publish it under its own name.
- **A shape change must record itself.** The spec pins the current
  `WORK_REF_NAMING.shape`. Changing it fails the pin, whose message says
  to append the old shape to `PREVIOUS_SHAPES`. That step then puts the
  old shape under the three cases.

## non-goals

- Renaming old units.

## architecture

- `packages/cli/src/commands/work-ref-migration.spec.ts`.

## Slices

- global_gate: none

### S1 — Old shapes are proven to keep working

- **Status**: done
- **Gate**: `npx vitest run packages/cli/src/commands/work-ref-migration.spec.ts`
- **Files**:
  - `packages/cli/src/commands/work-ref-migration.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real 39408361f. Un cambio de forma del work-ref NO rompe las unidades viejas: para la forma anterior al segmento kind, el CLI ACTUAL entra en la misma unidad, checkpointa sobre ella y la publica bajo su propio nombre (x00674 generalizado a todo el ciclo); un cambio de forma sin actualizar el pin FALLA la suite y el mensaje dice qué hay que grabar (work-ref-migration.spec 180 líneas como contrato de migración). Acceptance cubierta; gate 113/113 en lote. Sin cambios fuera de alcance.
## dependency graph

None.

## acceptance

- For the shape before the kind segment, the current CLI enters the same
  unit, checkpoints onto it and publishes it under its own name.
- A change of the shape without updating the pin fails the suite, and
  the message says what to record.
