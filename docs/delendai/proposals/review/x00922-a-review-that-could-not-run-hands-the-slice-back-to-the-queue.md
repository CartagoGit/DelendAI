---
id: x00922
title: "A review that could not run hands the slice back to the queue"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-18
last-transition-id: e5af04c1-55f4-4fed-81ed-17b5d525d0d6
last-correlation-id: e5af04c1-55f4-4fed-81ed-17b5d525d0d6
last-transition-from: in-progress
last-transition-at: 2026-10-18T21:05:39.906Z
---

# x00922 — A review that could not run hands the slice back to the queue

## goal

A reviewer who could not verify a slice (its gate could not run, the machine was busy, a tool was missing) is sent, by the review tool itself, to the path that already exists for it — giving the claim back with `review_claim { release: <why> }`, which leaves the slice in the review queue — instead of recording a request for changes nobody made.

## why

`proposal_review` (`plugins/proposals/src/lib/tools/authoring.tool.ts`) records `submit`, `approve` and `request_changes`. On q00011 S9 gemini-3.8-flash could not finish `bun run validate`, which waited on the shared compute lock while other agents validated, and recorded "No acceptance verdict is recorded; retry once the compute lock is available" — as `request_changes`. The slice went to its implementer as `changes_requested` and sat there, with nothing to change and nobody to pick it up, until the owner asked on 2026-10-18 why it was blocked when no agent was working.

The way out existed: `review_claim` says "If you could not inspect or run what you claimed, do not record a verdict: pass `release` with why, and the proposal goes back to the queue". But the tool a reviewer records its verdict with never said so, and an error of that same tool told the reviewer to "release the claim" without naming how. A new verdict for it was drafted and dropped: it would have been a second way to do what `release` does.

The resubmission that answered it also shows the note handling at fault: the tool writes "answers the request above: <note>" under a `resubmitted` round, and a note that already starts with those words is written with them twice ("resubmitted; answers the request above: resubmitted; answers the request above: …").

## non-goals

- A second mechanism beside `review_claim { release }`.
- Weakening `approve`: an approval still needs its evidence and a zero gate exit.

## slices

- global_gate: type

### S1 — The review tool sends an unverified slice back to the queue

- **Status**: review
- **Files**: `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/lib/knowledge/proposal-workflow.ts`, `apps/web/src/i18n/tools/delendai_proposals_proposal_review.ts`, `plugins/proposals/tests/src/lib/review-without-verdict.spec.ts`
- **Gate**: type
- acceptance:
  - "`proposal_review`'s description, its no-commit refusal and the review workflow knowledge tell a reviewer who could not verify a slice to record no verdict and give the claim back with `review_claim { release: <what stopped it> }`, never `request_changes`; the site's copy of the description says the same in every language. A spec holds the tool description and the workflow text."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `cb0e07a01f35`

### S2 — A note is written once

- **Status**: review
- **Files**: `plugins/proposals/src/lib/swarm/proposal-review.ts`, `plugins/proposals/tests/src/lib/proposal-review.spec.ts`
- **Gate**: type
- acceptance:
  - "A resubmission note that already begins with the words the tool adds (`resubmitted;`, `answers the request above:`) is recorded without repeating them. A spec holds it."
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `cb0e07a01f35`

## acceptance

- A reviewer who could not verify a slice is told to give the claim back, the slice stays in the queue, and a resubmission note says its words once.
