---
id: x00732
title: "The review queue reads the proposals that exist"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-28
priority: P0
related: [x00716, x00717, x00727]
---

# x00732 — The review queue reads the proposals that exist

## goal

`review_queue` lists every proposal in `review/`, whether or not a derived
index has been built where it runs.

## why

A swarm test in a throwaway repository with two proposals in `review/`:
`review_queue`, and so `delendai review next`, answered that nothing waited.
The queue read the derived index, which a fresh clone and a unit's worktree
do not have, and which the shared checkout on the integration branch cannot
build, because `sync` is a write the guard refuses there. The owner's log
from 2026-09-28 names the same thing: worktrees have no index.

## why this design

- The folder is where a proposal in review is. The queue reads
  `review/*.md` and takes each proposal's id and date from its frontmatter
  (the id from its filename when the frontmatter has none), oldest first as
  before.
- The queue no longer takes the index path; nothing else changes.

## non-goals

- Changing any other reader of the index.

## architecture

- `plugins/proposals/src/lib/services/review-backlog.service.ts` (new),
  `services/review-queue.service.ts`,
  `contracts/interfaces/review-queue.interface.ts`,
  `tools/review-queue.tool.ts`, and the queue spec.

## Slices

- global_gate: none

### S1 — The queue reads the review folder

- **Status**: in-progress
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/review-queue.tool.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/services/review-queue.service.ts`
  - `plugins/proposals/src/lib/services/review-backlog.service.ts`
  - `plugins/proposals/src/lib/contracts/interfaces/review-queue.interface.ts`
  - `plugins/proposals/src/lib/tools/review-queue.tool.ts`
  - `plugins/proposals/tests/src/lib/tools/review-queue.tool.spec.ts`

## dependency graph

None.

## acceptance

- With the index removed, the queue lists the proposals in `review/`,
  oldest first.
