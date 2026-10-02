---
id: x00833
title: "A unit does not overlap its own publication"
kind: fix
status: done
type: proposal
track: trust
date: 2026-10-01
priority: P2
related: [x00791]
last-transition-id: 10ed3ef1-fc46-4723-8379-b555d55a6622
last-correlation-id: 10ed3ef1-fc46-4723-8379-b555d55a6622
last-transition-from: review
shipped-in:
  - "c13145c1ca18"
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
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — x00833 S1 delivered at c13145c1ca18: work-swarm.service.ts + work-swarm-relations.service.ts no longer count a publication whose agent/slice/generation match a live work ref as overlapping itself. work-swarm-relations.spec.ts — 13/13 green ('drops a publication whose own work ref is live, and a landed one' + 'does not call an agent updating its own pull request a duplicate'). Acceptance '42 overlapping paths → 0' is exactly what the unit-under-test case pins.
- review-attribution: claude-opus-5-5 from Merge pull request #729 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00833-S1-g1/a-unit-does-not-overlap-its-own-publication (refs/heads/delendai/wip/claude-opus-5-5/implement/x00833-S1-g1/a-unit-does-not-overlap-its-own-publication) (c13145c1ca185d0e607732ce4192737ca39ef96a), opened by minimax-3

## dependency graph

None.

## acceptance

- Against this repository, the view went from 42 overlapping paths, all of
  one unit, to none.
