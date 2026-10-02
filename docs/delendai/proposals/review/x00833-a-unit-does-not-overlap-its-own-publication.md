---
id: x00833
title: "A unit does not overlap its own publication"
kind: fix
status: review
type: proposal
track: trust
date: 2026-10-01
priority: P2
related: [x00791]
last-transition-id: 3760845e-dee7-4611-89ec-d2cc677babd0
last-correlation-id: 3760845e-dee7-4611-89ec-d2cc677babd0
last-transition-from: in-progress
---

# x00833 — A unit does not overlap its own publication

## goal

`work swarm` reports an overlap only between different units of work.

## why

An agent updating its pull request holds the unit's work ref and its
publication at once. The swarm counted the two as separate units, so on
2026-10-01 it reported 42 overlapping paths that were all one unit's own
files. A view meant to show collisions that cries wolf on every update
teaches agents to stop reading it.

## why this design

- A publication whose agent, slice and generation match a live work ref is
  the same unit; the work ref is the newer copy and is the one counted.
- `work-swarm.service.ts` passed 400 lines with the change, so the pure
  relations and the text view move to `work-swarm-relations.service.ts`;
  the old module still exports them.

## non-goals

- Changing what counts as a relation between different units.

## Slices

- global_gate: none

### S1 — A unit's own publication is not counted as another unit

- **Status**: done
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/work-swarm-relations.spec.ts`
- **Files**:
  - `packages/core/src/lib/work-units/work-swarm.service.ts`
  - `packages/core/src/lib/work-units/work-swarm-relations.service.ts`
  - `packages/core/tests/src/lib/work-units/work-swarm-relations.spec.ts`
- shipped-in: `c13145c1ca18`

## dependency graph

None.

## acceptance

- Against this repository, the view went from 42 overlapping paths, all of
  one unit, to none.
