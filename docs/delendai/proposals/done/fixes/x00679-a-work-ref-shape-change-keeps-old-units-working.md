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
last-transition-id: 1dc1014c-5645-47f7-a93b-6c6102998151
last-correlation-id: 1dc1014c-5645-47f7-a93b-6c6102998151
last-transition-from: in-progress
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

- **Status**: done (git log: 39408361f Merge pull request #516 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00679-all-g1/a-work-ref-shape-change-keeps-old-units-working)
- **Gate**: `npx vitest run packages/cli/src/commands/work-ref-migration.spec.ts`
- **Files**:
  - `packages/cli/src/commands/work-ref-migration.spec.ts`
- review-state: in_review
- review-implementer: claude-opus-5-5
## dependency graph

None.

## acceptance

- For the shape before the kind segment, the current CLI enters the same
  unit, checkpoints onto it and publishes it under its own name.
- A change of the shape without updating the pin fails the suite, and
  the message says what to record.
