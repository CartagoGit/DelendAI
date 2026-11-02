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
last-transition-id: 997c8e69-aa9f-4b74-a973-ea33a75ae773
last-correlation-id: 997c8e69-aa9f-4b74-a973-ea33a75ae773
last-transition-from: review
shipped-in:
  - "c13145c1ca185d0e607732ce4192737ca39ef96a"
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
- review-reviewer: MiniMax-M3
- review-log: approved by MiniMax-M3 — work-swarm-relations.spec.ts green: 13/13 in 24.5s. Core typecheck on this branch surfaces 4 errors in 3 unrelated files (plugins/database/sqlite-driver.ts, sqlite-query-driver.ts, tools/scripts/report/tokenizer-real.script.ts), all pre-dating the delivering commit c13145c1ca18 (last touched by f00128 S1/S3 in 5bbde52a9/6e2cea8f9) — out of scope, not caused by this slice. Acceptance: '42 overlapping paths' → 0 in this repo (work-swarm.service no longer counts a publication whose agent/slice/generation match a live work ref).
- review-attribution: claude-opus-5-5 from Merge pull request #729 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00833-S1-g1/a-unit-does-not-overlap-its-own-publication (refs/heads/delendai/wip/claude-opus-5-5/implement/x00833-S1-g1/a-unit-does-not-overlap-its-own-publication) (c13145c1ca185d0e607732ce4192737ca39ef96a), opened by MiniMax-M3

## dependency graph

None.

## acceptance

- Against this repository, the view went from 42 overlapping paths, all of
  one unit, to none.
