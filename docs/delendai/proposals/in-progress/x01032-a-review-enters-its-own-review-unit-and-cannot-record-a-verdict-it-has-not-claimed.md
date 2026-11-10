---
id: x01032
title: "A review enters its own review unit and cannot record a verdict it has not claimed"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-11-04
last-transition-id: 541a2213-79e2-416d-88eb-d2030a5ef9b9
last-correlation-id: 541a2213-79e2-416d-88eb-d2030a5ef9b9
last-transition-from: review
last-transition-at: 2026-11-10T03:13:14.513Z
shipped-in:
  - "6578eb7c5"
---

# x01032 — A review enters its own review unit and cannot record a verdict it has not claimed

## goal

A reviewer, however weak the model, never chooses a unit kind and is refused at the tool, at once, when it judges a proposal its pack has not claimed.

## why

PR #1771, a gpt-5.3-codex review pack, shows four defects. (0) Root cause: the reviewer had two units. The claim of x01004 (301c68e18) went to the wip delendai/wip/gpt-5.3-codex/implement/batch-all-g1/work, while the other claims and the verdicts (4 commits) went to the publication ref delendai/pr/gpt-5.3-codex/review/batch-all-g1/verdicts, so the two refs diverged and the pack holds a verdict without its claim. The model is: all of a reviewer's claims and verdicts are committed to its one review wip; the publication is always cut from the wip by work publish, never written directly; the wip goes on after a publish and ends when the batch is done. (1) Its wip ref is delendai/wip/gpt-5.3-codex/implement/batch-all-g1/work: the review was entered with kind implement and topic work, while its publication is .../review/batch-all-g1/verdicts. work enter defaults kind to implement and trusts --kind, so a model that calls it directly gets the wrong unit. (2) The pack recorded a verdict on x01004 without claiming it; its claims were x01016 and d00418. proposal_review accepted it and only the closed-with-independent-approval lint caught it, on the PR. (3) A review publication's title and summary must come from what it ships: publication-pull-request.service already titles a pack from its verdict commits (x01023 retitles on republish), but only when the unit is a review unit and its commits carry the verdict subject, which defect 1 broke.

## non-goals

- Changing the closed-with-independent-approval lint: it stays as the backstop.
- Touching gpt-5.3-codex's unit, refs or verdicts.

## slices

- global_gate: none

### S1 — work enter derives the review kind
- **Status**: done
- **Files**: `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `packages/core/src/lib/work-units/review-kind.service.ts`, `packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`
- **Gate**: type
- acceptance:
  - "work enter for proposal batch, or for a proposal in review/, derives kind review and topic verdicts itself; a contradicting --kind is refused naming the right command (review next), and a spec covers each."
- shipped-in: `247313bf9ee3`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at 6578eb7c5, validate exit 0 and tests 58/58 claimed, no recorded run cited; acceptance 1/1: (1) packages/core/src/lib/work-units/review-kind.service.ts withReviewKind (called at work-unit-enter.service.ts:171): batch with no kind or review -> --kind=revie… — withReviewKind wired into work enter; batch refuses other kinds naming review next; a review/ proposal with no kind becomes the batch review unit. Reading: 'a contradicting --kind is refused' is met for the batch; an explicit kind on a review/ proposal is kept on purpose (fix after review), documented in review-kind.service.ts and specced.

### S2 — The review tools enter or reuse the reviewer's review unit
- **Status**: in-progress
- **Files**: `plugins/proposals/src/lib/tools/review-claim.tool.ts`, `plugins/proposals/tests/src/lib/tools/review-claim.tool.spec.ts`
- **Gate**: type
- acceptance:
  - "review_claim and review_queue, called with no unit, enter or reuse the caller's review unit, so a reviewer never chooses a kind; a spec shows an agent with no unit ending in kind review."
- shipped-in: `0fb7224c8398`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: requested_changes by claude-opus-5-5 — Acceptance not met as written. (1) plugins/proposals/src/lib/tools/review-claim.tool.ts:170-182: review_claim called outside a review unit REFUSES and tells the agent to run 'delendai review next'; it does not enter or reuse the caller's review unit. (2) plugins/proposals/src/lib/tools/review-queue.tool.ts:70-78 only reads an existing unit via reviewUnitOfAgent; with no unit it enters nothing. (3) No spec shows an agent with no unit ending in kind review: plugins/proposals/tests/src/lib/tools/review-claim.tool.spec.ts:118 asserts the refusal instead. Either make review_claim/review_queue enter-or-reuse the review unit (with that spec), or amend S2's acceptance to the refusal that shipped (commit 0fb7224c8 subject already says 'is refused') and hand it over again.

### S3 — proposal_review refuses a verdict on an unclaimed proposal
- **Status**: done
- **Files**: `plugins/proposals/src/lib/services/review-claim.service.ts`, `plugins/proposals/src/lib/tools/authoring/proposal-review.tool.ts`, `plugins/proposals/tests/src/lib/tools/proposal-review-claim.spec.ts`
- **Gate**: type
- acceptance:
  - "proposal_review submit, approve or request_changes on a proposal the pack has not claimed is refused at once with the review_claim command to run; a spec shows x01004 refused when only x01016 is claimed, and the lint is unchanged."
- shipped-in: `d08f20884a0d`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at 6578eb7c5, validate exit 0 and tests 58/58 claimed, no recorded run cited; acceptance 1/1: (1) proposal-review.tool.ts:277 and :308 call verdictClaimRefusal (review-claim.service.ts:253-285, nextAction names review_claim, 'Nothing was written'); proposal… — verdictClaimRefusal gates submit/approve/request_changes/attest; lint untouched

### S4 — A review pack is titled by its verdicts
- **Status**: done
- **Files**: `packages/core/src/lib/work-units/publication-pull-request.service.ts`, `packages/core/tests/src/lib/work-units/publication-pull-request.service.spec.ts`
- **Gate**: type
- acceptance:
  - "The pull request of a review unit is titled and summarised from the proposals it judges, never implement batch, on first open and on republish; a spec covers a review unit whose branch names batch."
- shipped-in: `f7d36c3592bf`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at 6578eb7c5, validate exit 0 and tests 58/58 claimed, no recorded run cited; acceptance 1/1: (1) publication-pull-request.service.ts (f7d36c359); publication-pull-request.service.spec.ts:323 'names a review unit by what it claimed and judged, never impleme… — review unit PR titled from claims/verdicts

### S5 — One review wip, a diverged pack reported, a sibling publication merged or retired
- **Status**: done
- **Files**: `packages/core/src/lib/work-units/work-unit-status.service.ts`, `packages/core/src/lib/work-units/diverged-review-pack.service.ts`, `packages/core/src/lib/work-units/sibling-publications.service.ts`, `packages/core/src/lib/work-units/work-publish.service.ts`, `packages/core/tests/src/lib/work-units/diverged-review-pack.service.spec.ts`, `packages/core/tests/src/lib/work-units/sibling-publications.spec.ts`
- **Gate**: type
- acceptance:
  - "review_claim and every proposal_review action commit on the reviewer's review wip, and work publish cuts the pack from that wip; work status reports a pack ref holding commits its wip lacks, with the merge to run; specs cover claim and verdict landing on the wip, a publish cutting the pack from it, and a diverged pack reported."
- shipped-in: `247313bf9ee3`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at 6578eb7c5, validate exit 0 and tests 58/58 claimed, no recorded run cited; acceptance 1/1: (1) work-unit-status.service.ts:196,231-233 report divergedReviewPacks with the merge command; diverged-review-pack.service.spec.ts:9,19,35; sibling-publications.s… — diverged pack reported by work status; claims and verdicts on the wip

## acceptance

- work enter for proposal batch, or for a proposal in review/, derives kind review and topic verdicts itself; a contradicting --kind is refused naming the right command (review next), and a spec covers each.
- review_claim and review_queue, called with no unit, enter or reuse the caller's review unit, so a reviewer never chooses a kind; a spec shows an agent with no unit ending in kind review.
- proposal_review submit, approve or request_changes on a proposal the pack has not claimed is refused at once with the review_claim command to run; a spec shows x01004 refused when only x01016 is claimed, and the lint is unchanged.
- The pull request of a review unit is titled and summarised from the proposals it judges, never implement batch, on first open and on republish; a spec covers a review unit whose branch names batch.
- review_claim and every proposal_review action commit on the reviewer's review wip, and work publish cuts the pack from that wip; work status reports a pack ref holding commits its wip lacks, with the merge to run; specs cover claim and verdict landing on the wip, a publish cutting the pack from it, and a diverged pack reported.
