---
id: x00700
title: "An approved proposal closes by itself"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [x00696, x00680]
last-transition-id: e85d5648-b7f1-4afc-b0e7-64a987f1438b
last-correlation-id: e85d5648-b7f1-4afc-b0e7-64a987f1438b
last-transition-from: in-progress
---

# x00700 — An approved proposal closes by itself

## goal

A proposal whose every slice is done and approved by someone other than
its implementer reaches `done/`, whether or not its reviewer's own close
succeeded.

## why

On 2026-09-27 GLM approved x00596–x00603 slice by slice through
`proposal_review`. That approval tries to close the proposal, and each
close was refused while the integration branch's tip awaited
certification. Nothing retried it. The proposals sat in `review/` with
every slice approved; twelve more (x00649–x00661) followed the same
path within the hour. The owner saw a review folder that never emptied,
and reviewers kept looking at work that was already reviewed.

## why this design

- **The owner machine retries on every pass.** The hydrator runs every
  ten minutes and whenever the integration branch moves. Its new step
  reads `review/` on the integration branch and selects proposals that
  are ready:
  - every slice `done`;
  - each approved by someone other than its implementer (the rule of
    `lint:closed-with-independent-approval`, x00696);
  - `shipped-in` recorded.
- **Through the normal door.** The step enters a review unit of its own
  (`delendai-queue`), runs `transition-proposal.script.ts` (the same
  `runProposalTransition` and every gate) in that worktree, commits, and
  publishes one pull request. That pull request is validated like any
  other and armed by the queue in the same pass. A refused close leaves
  the proposal for the next pass.
- **The owner's decisions wait.** A proposal marked
  `owner-decision: pending` is never closed by the step. x00546 is
  marked.

## non-goals

- Closing without independent approval. That remains the owner's call
  (x00696).

## architecture

- `tools/scripts/proposals/close-approved-proposals.script.ts`:
  `readyToClose` and the pass.
- `tools/scripts/git/hydrate-candidates-after-merge.script.ts`: the step,
  before the queue advances.
- `docs/delendai/proposals/review/x00546-…`: `owner-decision: pending`.

## Slices

- global_gate: none

### S1 — Approved proposals close on the next pass

- **Status**: review
- **Gate**: `npx vitest run tools/scripts/proposals/close-approved-proposals.script.spec.ts`
- **Files**:
  - `tools/scripts/proposals/close-approved-proposals.script.ts`
  - `tools/scripts/proposals/close-approved-proposals.script.spec.ts`
  - `tools/scripts/git/hydrate-candidates-after-merge.script.ts`
  - `docs/delendai/proposals/review/x00546-work-refs-are-visible-named-after-their-model-and-known-to-the-ref-guard.md`
- review-state: in_review
- review-implementer: claude-opus-5-5
## dependency graph

x00696 (the approval rule it reuses).

## acceptance

- A proposal with every slice done, independently approved and with
  `shipped-in` is ready. Without `shipped-in`, with an unfinished slice,
  approved only by its implementer, or marked for the owner, it is not.
- Read-only against develop, the step lists the approved proposals in
  review (x00596–x00603, x00649–x00661, among others) and not x00546
  once it is marked.
