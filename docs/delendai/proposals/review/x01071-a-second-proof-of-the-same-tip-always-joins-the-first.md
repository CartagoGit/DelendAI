---
id: x01071
title: "A second proof of the same tip always joins the first"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-15
last-transition-id: 84b46e0c-d4ed-498b-a2f7-834ef6b66b9f
last-correlation-id: 84b46e0c-d4ed-498b-a2f7-834ef6b66b9f
last-transition-from: in-progress
last-transition-at: 2026-11-15T17:14:56.343Z
---

# x01071 — A second proof of the same tip always joins the first

## goal

A caller of `withComputeSlot` for a unit and tip that asked while another proof of that same tip was waiting or running always receives that proof's answer and never runs `run` again, however slowly its own first steps went.

## why

develop run 43714842412 (job "tests: core 1/3", f23f4a6c9) failed `compute-slot.service.e2e.spec.ts` twice: "joins a second caller on the same tip" got runs [1,2], and "joins two processes on one tip" timed out at 120000 ms.

Root cause. `withUnitTurn` decides to join only by finding a live `.claim` file. The claimant deletes its claim when it finishes (result and `.done` written first). A second caller whose first claim read (after its `mkdir` and `writeFile(current)`, both real disk I/O) lands after the claimant has completed the whole turn finds no claim, writes its own and runs the proof again, though it asked before the first proof ended. In-process the claimant needs only the holder's release to finish, so a slow disk in the second caller's two awaits is enough ([1,2]). Across processes the spec releases the first child as soon as it has printed ASKING, and the second child's claim read is still a few awaits away: it finds nothing, becomes a second claimant, runs, prints HELD and waits for a release nobody sends, which is the timeout. The spec itself says this ordering is "the one thing here not enforced". The product has no durable record that a proof finished after a given caller asked.

Fix design. Stamp the time a call starts (`askedAt`, taken synchronously at entry of `withUnitTurn`, before any await, so before any release that follows the caller's announcement) and stamp `finishedAt` in the `.done` record. In the claim loop, when no live claim exists, read `.done` of the tip: if its `finishedAt >= askedAt` and its result file holds a result that is not `superseded`, the proof finished during this call, so return that result (value or failure) instead of claiming. A call that starts after the proof finished still proves again. A superseded result is never joined this way (it would loop on a caller's own result). No timer, retry or longer timeout is involved.

## non-goals

- Changing the supersede rules between different tips of one unit.
- Retrying or lengthening any test timeout.

## slices

- global_gate: type

### S1 — Join the proof that finished during the call
- **Status**: review
- **Files**: `packages/core/src/lib/shared/compute-slot.service.ts`, `packages/core/tests/src/lib/shared/compute-slot.service.e2e.spec.ts`
- **Gate**: type
- acceptance:
  - "A caller that asked before a proof of the same unit and tip finished returns that proof's answer even when its first claim read happens after the claimant removed its claim; a call made after the finish proves again."
  - "The compute-slot e2e spec has a test where the claimant has finished before the second caller's first claim read (done record planted with finishedAt after askedAt), and it passes deterministically."
- shipped-in: `98d10cd17288`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- The two failing specs of run 43714842412 pass without any timing dependence, and the cause above is pinned by a spec that reproduces the late claim read directly.
