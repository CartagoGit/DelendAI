---
id: x00922
title: "A review that could not run hands the slice back to the queue"
kind: fix
status: ready
type: proposal
track: general
date: 2026-10-18
---

# x00922 — A review that could not run hands the slice back to the queue

## goal

A reviewer who could not verify a slice (its gate could not run, the machine was busy, a tool was missing) says so with a verdict of its own, and the slice goes back to the review queue for the next reviewer, instead of to its implementer as a request for changes nobody made.

## why

`proposal_review` (`plugins/proposals/src/lib/swarm/proposal-review.ts`) has three actions: `submit`, `approve`, `request_changes`. On q00011 S9 gemini-3.8-flash could not finish `bun run validate`, which waited on the shared compute lock while other agents validated, and recorded "No acceptance verdict is recorded; retry once the compute lock is available" — as `request_changes`, the only way to record anything. The slice went to its implementer as `changes_requested` and sat there, with nothing to change and nobody to pick it up, until the owner asked on 2026-10-18 why it was blocked when no agent was working.

The resubmission that answered it also shows the note handling at fault: the tool writes "answers the request above: <note>" under a `resubmitted` round, and a note that already starts with those words is written with them twice ("resubmitted; answers the request above: resubmitted; answers the request above: …").

## non-goals

- Weakening `approve`: an approval still needs its evidence and a zero gate exit.

## slices

- global_gate: type

### S1 — An inconclusive verdict

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/swarm/proposal-review.ts`, `plugins/proposals/src/lib/contracts/surfaces/proposal-read.contract.ts`, `plugins/proposals/src/lib/services/review-queue-slice.service.ts`
- **Gate**: type
- acceptance:
  - "`proposal_review { action: \"inconclusive\", note }` records a round `inconclusive` by that reviewer with what stopped the review, releases the reviewer, and leaves the slice `in_review`: `review_queue` lists it again as needing a verdict, and the implementer is asked nothing."
  - "A note is required, and the round never counts as an approval or a request for changes in any gate that counts them. Specs hold the round, the queue listing it again, and the implementer's view unchanged."

### S2 — A note is written once

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/swarm/proposal-review.ts`
- **Gate**: type
- acceptance:
  - "A resubmission note that already begins with the words the tool adds (`resubmitted;`, `answers the request above:`) is recorded without repeating them. A spec holds it."

## acceptance

- A slice a reviewer could not verify is back in the queue at once, and its log says why, once.
