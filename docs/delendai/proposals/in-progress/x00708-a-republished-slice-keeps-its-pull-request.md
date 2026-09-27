---
id: x00708
title: "A republished slice keeps its pull request"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [x00553, x00677]
---

# x00708 — A republished slice keeps its pull request

## goal

Publishing a slice again updates the pull request it already has. It
never opens a second one for the same work.

## why

On 2026-09-27 x00706 S1 was published as its own slice (#562). After a
follow-up commit and a merge of develop it was published again, and
`choosePublicationTarget` measured the work afresh. The larger diff now
named the whole proposal, so the publisher pushed `x00706-all-g1` and
opened #564 beside #562. The existing-publication check skipped a slice
publication only when it was *another* slice's (`alone !== own`). A
slice's own publication fell through to the size decision.

## why this design

- **An existing publication of this slice decides first.** The size
  heuristic chooses where new work goes, not where published work moves.

## non-goals

- Changing the size heuristic.

## architecture

- `packages/cli/src/lib/publication-target.service.ts`

## Slices

- global_gate: none

### S1 — Same slice, same pull request

- **Status**: in-progress
- **Gate**: `npx vitest run packages/cli/src/lib/publication-target.service.spec.ts`
- **Files**:
  - `packages/cli/src/lib/publication-target.service.ts`
  - `packages/cli/src/lib/publication-target.service.spec.ts`

## dependency graph

None.

## acceptance

- A slice published alone, measured again as a small proposal, still
  targets its own publication. Without the fix the spec fails.
