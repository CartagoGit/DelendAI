---
id: x00744
title: "A delivery is what its pull request merged"
kind: fix
status: done
type: proposal
track: hosts
date: 2026-09-28
priority: P1
related: [x00646, x00742]
last-transition-id: 2dea63ff-5ee2-4e11-9008-ebc5c3bfbc7a
last-correlation-id: 2dea63ff-5ee2-4e11-9008-ebc5c3bfbc7a
last-transition-from: review
shipped-in:
  - "e65477be4"
---

# x00744 — A delivery is what its pull request merged

## goal

A proposal delivered through a pull request can be reviewed, whatever
commit ended up at the branch's tip. The review backlog says in words what
each of its numbers counts.

## why

After the swarm's reviews were reconciled, `review_queue` still reported 53
proposals in review: 21 slices needing a verdict, 51 blocked, and "5 ready
to close". The owner could not reconcile those figures.

- 36 proposals were blocked with "a commit that delivered x…: one that
  changes a declared file of the slice or cites the proposal id". The
  candidate is the tip of the merged branch. The queue refreshes a
  candidate before merging it ("recompute after refreshing the
  candidate"), so that tip usually changes only generated files. Judged
  alone it touched nothing the slice declares, and a delivered proposal
  read as undeliverable. 34 of the 36 were delivered.
- `totals` counts slices in some fields and proposals in others, under
  names that do not say which. A reviewer reported "5 ready to close"
  as slices beside 21 and 51 slices, and told the owner a picture nobody
  could match with the proposal counts.

## why this design

- When the commit alone neither touches a declared file nor cites the
  proposal, attribution asks the merge that brought it into the
  integration branch (`deliveringMerge`, already used for the
  implementer). It judges the merge's diff (`M^1..M`) and the merge's
  message. The branch is delivered whole.
- `review_queue` gains `summary`, one sentence that names the unit of every
  figure. `totals` keeps its fields for the callers that read them.

## non-goals

- Proposals with no delivery on the integration branch at all: they stay
  blocked, with the datum that is missing.

## architecture

- `plugins/proposals/src/lib/services/review-attribution.ts`.
- `plugins/proposals/src/lib/services/review-queue-summary.service.ts`
  (new), `review-queue.service.ts`, the queue's schema and interface.

## Slices

- global_gate: none

### S1 — The merge is the delivery; the backlog says its units

- **Status**: done
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts plugins/proposals/tests/src/lib/services/review-queue-summary.service.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/services/review-attribution.ts`
  - `plugins/proposals/src/lib/services/delivering-merge.service.ts`
  - `plugins/proposals/src/lib/services/review-queue-summary.service.ts`
  - `plugins/proposals/src/lib/services/review-queue.service.ts`
  - `plugins/proposals/src/lib/contracts/interfaces/review-queue.interface.ts`
  - `plugins/proposals/src/lib/contracts/constants/review-queue-schema.constant.ts`
  - `plugins/proposals/src/generated/tool-outputs.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts`
  - `plugins/proposals/tests/src/lib/services/review-queue-summary.service.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé e65477be4 (x00744 S1, merge PR #617). fix(review): a delivery is what its pull request merged. review-attribution ahora trata 'el commit X se mergeó en develop vía PR Y' como la entrega definitiva (no commits de feature branch no mergeados). 5/5 verde en review-claim.tool.spec.ts. claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: claude-opus-5-5 from Merge pull request #617 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00744-S1-g1/a-delivery-is-what-its-pull-request-merged (refs/heads/delendai/wip/claude-opus-5-5/implement/x00744-S1-g1/a-delivery-is-what-its-pull-request-merged) (e65477be4a4cf92318b1a619c7b7d07b2040cac0), opened by minimax-m3

## dependency graph

None.

## acceptance

- A pull request whose tip is the queue's refresh is approved against that
  tip, attributed to the unit its merge names.
- On this repository's backlog of 2026-09-28, the fully blocked proposals
  go from 36 to 2 (x00543, x00620), and slices needing a verdict from 21 to
  67.
- `review_queue` reports `summary`, naming slices and proposals apart.
