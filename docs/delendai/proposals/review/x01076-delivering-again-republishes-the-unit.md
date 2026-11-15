---
id: x01076
title: "Delivering again republishes the unit"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-15
last-transition-id: 91781bd6-6516-45d7-a4f8-d48d975ce9b1
last-correlation-id: 91781bd6-6516-45d7-a4f8-d48d975ce9b1
last-transition-from: in-progress
last-transition-at: 2026-11-15T23:04:59.607Z
---

# x01076 — Delivering again republishes the unit

## goal

When `work deliver` runs for a unit whose proposal already stands in review (a unit re-entered with --generation to fix a delivered pull request), it skips the transition that cannot apply, publishes the unit's new tip to its publication branch, and reports the pull request.

## why

Re-delivering a unit of a proposal in review logged `illegal transition: "review" → "review"` and exited 0, never pushed the new tip (the push happens only inside the transition to review), and its result did not say the pull request kept its old head. Someone had to run `work publish` by hand.

## non-goals

- Changing the proposal state machine or allowing review to review in the transition tool.
- Changing how a first delivery proves, transitions or publishes.

## slices

- global_gate: none

### S1 — Deliver republishes when the proposal is already in review
- **Status**: review
- **Files**: `packages/cli/src/lib/work-deliver.service.ts`, `packages/cli/src/lib/work-deliver.service.spec.ts`
- **Gate**: type
- acceptance:
  - "With the proposal already in review, deliver does not return the illegal transition as a failure; it publishes the unit and exits 0."
  - "The result of such a delivery has republished true and the pull request (number and url, or the pending branch)."
  - "A refusal other than already-in-review still fails the delivery; a first delivery behaves as before."
  - "The behaviour is covered by specs with injected ports."
- shipped-in: `c02f198ae128`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- With the proposal already in review, deliver does not return the illegal transition as a failure; it publishes the unit and exits 0.
- The result of such a delivery has republished true and the pull request (number and url, or the pending branch).
- A refusal other than already-in-review still fails the delivery; a first delivery behaves as before.
- The behaviour is covered by specs with injected ports.
