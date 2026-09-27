---
id: x00707
title: "No output points around the review"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [x00696, x00677, x00690]
last-transition-id: 50154694-6a07-4f2d-b1ea-eb10a94bc384
last-correlation-id: 50154694-6a07-4f2d-b1ea-eb10a94bc384
last-transition-from: in-progress
---

# x00707 — No output points around the review

## goal

No refusal or next action tells an agent how to close without an
independent review, or to open a pull request by hand.

## why

On 2026-09-27 reviewer agents closed about 200 proposals with
`proposal_force_transition … skipPeerReview: true`. They were doing what
the tools had told them. `proposal_review`'s recovery hint named that
exact call, and the `force_transition` refusal ended "or pass
skipPeerReview:true only with host approval", an approval nothing checks.
`work publish` likewise told an agent without `gh` to run `gh pr create`
itself, which adds a second author for a publication the owner machine
opens after the next merge (x00677). x00696 made CI refuse such closes.
The outputs still pointed at them.

## why this design

- **Say whose step it is.** Closing without an independent approval is
  the owner's decision, so the refusal says so and names the CI check
  that enforces it. A missing pull request is opened by the owner machine.
- **The parameters stay.** `skipPeerReview` remains the owner's tool.
  Only the invitation goes.

## non-goals

- Removing `skipPeerReview` or `force`.

## architecture

- `plugins/proposals/src/lib/tools/authoring.tool.ts`: `missingSliceNextAction`.
- `plugins/proposals/src/lib/tools/recovery-tools.ts`: the review → done refusal.
- `packages/cli/src/lib/publication-pull-request.service.ts`: no-`gh` and failed-open reasons.

## Slices

- global_gate: none

### S1 — Outputs name the owner's step

- **Status**: review
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/review.tool.spec.ts plugins/proposals/tests/src/lib/tools/caller-checkout-tools.spec.ts packages/cli/src/lib/publication-pull-request.service.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/tools/authoring.tool.ts`
  - `plugins/proposals/src/lib/tools/recovery-tools.ts`
  - `packages/cli/src/lib/publication-pull-request.service.ts`
  - `plugins/proposals/tests/src/lib/review.tool.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/caller-checkout-tools.spec.ts`
  - `packages/cli/src/lib/publication-pull-request.service.spec.ts`
- review-state: in_review
- review-implementer: claude-opus-5-5
## dependency graph

None.

## acceptance

- The review recovery hint and the force_transition refusal name neither
  `force_transition` to done nor `skipPeerReview`. The refusal names the
  owner.
- A publication without `gh` is not told to run `gh pr create`.
