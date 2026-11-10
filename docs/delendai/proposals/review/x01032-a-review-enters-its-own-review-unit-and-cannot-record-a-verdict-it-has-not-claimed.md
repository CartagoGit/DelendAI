---
id: x01032
title: "A review enters its own review unit and cannot record a verdict it has not claimed"
kind: fix
status: review
type: proposal
track: trust
date: 2026-11-04
last-transition-id: 07fe320f-c27b-43ec-bd40-5198049dcc18
last-correlation-id: 07fe320f-c27b-43ec-bd40-5198049dcc18
last-transition-from: in-progress
last-transition-at: 2026-11-10T02:56:55.503Z
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
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `packages/core/src/lib/work-units/review-kind.service.ts`, `packages/core/tests/src/lib/work-units/work-unit.service.e2e.spec.ts`
- **Gate**: type
- acceptance:
  - "work enter for proposal batch, or for a proposal in review/, derives kind review and topic verdicts itself; a contradicting --kind is refused naming the right command (review next), and a spec covers each."
- shipped-in: `247313bf9ee3`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — The review tools enter or reuse the reviewer's review unit
- **Status**: review
- **Files**: `plugins/proposals/src/lib/tools/review-claim.tool.ts`, `plugins/proposals/tests/src/lib/tools/review-claim.tool.spec.ts`
- **Gate**: type
- acceptance:
  - "review_claim called outside a review unit writes nothing and refuses, naming the one way in (`review next`, which derives kind review); review_queue stays read-only and reads the caller's review unit when one exists; a spec covers the refusal."
- notes: The first acceptance had the tools enter the unit. One way to enter a review unit already exists (`work enter` derives kind review, S1), so a second entry inside two tools would add a path, make a read-only queue create a worktree, and couple the proposals plugin to the work-unit service for every host. The refusal names the single command, costs a reviewer one call, and needs no host-specific behaviour. S1 also named a spec that q00045 renamed to `.e2e.spec.ts`; the path is corrected.
- shipped-in: `0fb7224c8398`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S3 — proposal_review refuses a verdict on an unclaimed proposal
- **Status**: review
- **Files**: `plugins/proposals/src/lib/services/review-claim.service.ts`, `plugins/proposals/src/lib/tools/authoring/proposal-review.tool.ts`, `plugins/proposals/tests/src/lib/tools/proposal-review-claim.spec.ts`
- **Gate**: type
- acceptance:
  - "proposal_review submit, approve or request_changes on a proposal the pack has not claimed is refused at once with the review_claim command to run; a spec shows x01004 refused when only x01016 is claimed, and the lint is unchanged."
- shipped-in: `d08f20884a0d`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S4 — A review pack is titled by its verdicts
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/publication-pull-request.service.ts`, `packages/core/tests/src/lib/work-units/publication-pull-request.service.spec.ts`
- **Gate**: type
- acceptance:
  - "The pull request of a review unit is titled and summarised from the proposals it judges, never implement batch, on first open and on republish; a spec covers a review unit whose branch names batch."
- shipped-in: `f7d36c3592bf`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S5 — One review wip, a diverged pack reported, a sibling publication merged or retired
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/work-unit-status.service.ts`, `packages/core/src/lib/work-units/diverged-review-pack.service.ts`, `packages/core/src/lib/work-units/sibling-publications.service.ts`, `packages/core/src/lib/work-units/work-publish.service.ts`, `packages/core/tests/src/lib/work-units/diverged-review-pack.service.spec.ts`, `packages/core/tests/src/lib/work-units/sibling-publications.spec.ts`
- **Gate**: type
- acceptance:
  - "review_claim and every proposal_review action commit on the reviewer's review wip, and work publish cuts the pack from that wip; work status reports a pack ref holding commits its wip lacks, with the merge to run; specs cover claim and verdict landing on the wip, a publish cutting the pack from it, and a diverged pack reported."
- shipped-in: `247313bf9ee3`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- work enter for proposal batch, or for a proposal in review/, derives kind review and topic verdicts itself; a contradicting --kind is refused naming the right command (review next), and a spec covers each.
- review_claim and review_queue, called with no unit, enter or reuse the caller's review unit, so a reviewer never chooses a kind; a spec shows an agent with no unit ending in kind review.
- proposal_review submit, approve or request_changes on a proposal the pack has not claimed is refused at once with the review_claim command to run; a spec shows x01004 refused when only x01016 is claimed, and the lint is unchanged.
- The pull request of a review unit is titled and summarised from the proposals it judges, never implement batch, on first open and on republish; a spec covers a review unit whose branch names batch.
- review_claim and every proposal_review action commit on the reviewer's review wip, and work publish cuts the pack from that wip; work status reports a pack ref holding commits its wip lacks, with the merge to run; specs cover claim and verdict landing on the wip, a publish cutting the pack from it, and a diverged pack reported.
