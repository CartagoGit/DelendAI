---
id: x01097
title: "work revalidate hands over an in-progress proposal whose live slices all shipped and that has no unit"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-18
last-transition-id: bc60d502-314a-4021-b5ca-1c535baf63f2
last-correlation-id: bc60d502-314a-4021-b5ca-1c535baf63f2
last-transition-from: review
last-transition-at: 2026-11-18T12:06:20.537Z
---

# x01097 — work revalidate hands over an in-progress proposal whose live slices all shipped and that has no unit

## goal

`delendai work revalidate` also selects proposals in in-progress whose live slices all carry shipped-in and that no live unit holds, and moves each to review in the same batch unit, so the doctor finding in-progress-has-units is cleared by one command instead of one unit and one proof per proposal.

## why

On 2026-11-18 land-upkeep-develop failed on in-progress-has-units for f00799, f00814, q00045 and x01059, whose slices had all shipped on develop. The only path was one work enter plus one full work deliver proof per proposal, a serial per-item flow; revalidate already batches the review transition for ready proposals but refuses any stage other than ready.

## non-goals

- Handing over a proposal with an unshipped live slice.
- Handing over a proposal that a live unit holds, here or on the forge.
- Changing the changes_requested selection of ready proposals.

## slices

- global_gate: none

### S1 — revalidate selects finished in-progress proposals with no unit
- **Status**: review
- **Files**: `packages/cli/src/lib/work-revalidate.service.ts`, `packages/cli/src/lib/work-revalidate.service.spec.ts`, `packages/cli/src/lib/work-revalidate-ports.service.ts`, `packages/core/src/lib/work-units/in-progress-units.service.ts`
- **Gate**: lint
- **Decisions**: none
- acceptance:
  - "work-revalidate.service.spec.ts asserts that `revalidateRefusalOf` accepts a proposal in in-progress whose live slices all have shipped-in and for which the ports report no live unit, with review as its only step, while a ready proposal keeps the steps in-progress then review."
  - "work-revalidate.service.spec.ts covers: an in-progress proposal with every live slice shipped and no unit (chosen, one step); one with an unshipped slice (left out, named); one held by a live unit (left out, named); a ready changes_requested proposal (unchanged)."
  - "`bun run work:doctor` reports in-progress-has-units healthy after `delendai work revalidate` hands over every in-progress proposal whose slices all shipped, and its remedy for an in-progress proposal whose slices all shipped (in-progress-units.service.ts) names `delendai work revalidate`."
- shipped-in: `742025b2e16d`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- work-revalidate.service.spec.ts asserts that `revalidateRefusalOf` accepts a proposal in in-progress whose live slices all have shipped-in and for which the ports report no live unit, with review as its only step, while a ready proposal keeps the steps in-progress then review.
- work-revalidate.service.spec.ts covers: an in-progress proposal with every live slice shipped and no unit (chosen, one step); one with an unshipped slice (left out, named); one held by a live unit (left out, named); a ready changes_requested proposal (unchanged).
- `bun run work:doctor` reports in-progress-has-units healthy after `delendai work revalidate` hands over every in-progress proposal whose slices all shipped, and its remedy for an in-progress proposal whose slices all shipped (in-progress-units.service.ts) names `delendai work revalidate`.
