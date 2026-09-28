---
id: x00745
title: "A proposal enters review in a state a reviewer can act on"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-28
priority: P1
related: [x00643, x00696, x00744]
last-transition-id: 7638b818-99e4-4d1d-8a61-4b45121ce1b8
last-correlation-id: 7638b818-99e4-4d1d-8a61-4b45121ce1b8
last-transition-from: in-progress
---

# x00745 — A proposal enters review in a state a reviewer can act on

## goal

No proposal sits in review with nothing anyone can do about it. What a
reviewer needs is fixed when the proposal is handed over, and a verdict
is signed by a reviewer, not by a role.

## why

On 2026-09-28, 53 proposals were in review. After x00744, three kinds
were still stuck:

- **No delivery on record.** x00543 and x00620 were delivered by direct
  commits that went through no unit's pull request. The queue found no
  delivering commit, and no reviewer could judge them until someone
  looked the commits up by hand.
- **Declared files that do not exist.** x00546 was approved and could
  never close: two of its declared files are not in the repository. That
  is checked only at the close, after a reviewer has spent the review.
- **A role signing verdicts.** x00519, x00520 and x00531 were approved by
  `delivery_verifier`, a Claude subagent reviewing Claude's work. The
  queue listed them as ready to close.

## why this design

- **At the hand-off.** It is the one moment the delivering commits are
  certainly at hand: they are on the branch being handed over.
  `proposal_transition` to `review` (`prepareReviewEntry`):
  - refuses when a declared file does not exist, with the step that fixes
    it;
  - records on each slice, as `shipped-in`, the last commit on the branch
    (beyond the integration branch) that changed its declared files;
  - refuses a slice that no commit on the branch delivers and that
    records no delivery, naming it.

  A slice that already records `shipped-in`, or a proposal whose
  frontmatter does, is left as it is. A proposal coming back from `done`
  (`force`) is not judged.
- **A verdict names a reviewer.** `proposal_review` refuses `approve` and
  `request_changes` signed with one of delendai's canonical roles
  (`AGENT_CANONICAL_ROLES`), whatever the spelling (`delivery_verifier`,
  `delivery-verifier`, `delendai-delivery-verifier`).

## non-goals

- Proposals already in review. They are handled one by one.

## architecture

- `plugins/proposals/src/lib/services/review-entry.service.ts` (new),
  `contracts/interfaces/review-entry.interface.ts` (new),
  `tools/proposal-transition.tool.ts`.
- `plugins/proposals/src/lib/shared/agent-conventions.ts`,
  `tools/authoring.tool.ts`.

## Slices

- global_gate: none

### S1 — The hand-off records the delivery; a role does not sign

- **Status**: review
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/services/review-entry.service.spec.ts plugins/proposals/tests/src/lib/tools/proposal-review-claim.spec.ts plugins/proposals/tests/src/lib/tools/proposal-transition.tool.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/services/review-entry.service.ts`
  - `plugins/proposals/src/lib/services/proposal-completeness.ts`
  - `plugins/proposals/src/lib/contracts/interfaces/review-entry.interface.ts`
  - `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
  - `plugins/proposals/src/lib/shared/agent-conventions.ts`
  - `plugins/proposals/src/lib/tools/authoring.tool.ts`
  - `plugins/proposals/tests/src/lib/services/review-entry.service.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-review-claim.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-transition.tool.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-transition-checkout.spec.ts`
  - `plugins/proposals/tests/src/lib/review.tool.spec.ts`
  - `plugins/proposals/tests/src/lib/services/projection-follows-every-writer.spec.ts`

## dependency graph

None.

## acceptance

- Handing over a proposal whose slice's work is committed on the branch
  records that commit on the slice.
- Handing over a slice with no commit and no recorded delivery is refused,
  naming the slice. A declared file that does not exist is refused, naming
  the file.
- An approval signed `delivery_verifier`, `delivery-verifier` or
  `delendai-delivery-verifier` is refused.
