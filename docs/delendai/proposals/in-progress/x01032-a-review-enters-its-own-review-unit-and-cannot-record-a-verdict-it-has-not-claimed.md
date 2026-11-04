---
id: x01032
title: "A review enters its own review unit and cannot record a verdict it has not claimed"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-11-04
last-transition-id: 3646bfa2-ae35-414f-ab68-785b35c263aa
last-correlation-id: 3646bfa2-ae35-414f-ab68-785b35c263aa
last-transition-from: ready
last-transition-at: 2026-11-04T14:59:20.009Z
---

# x01032 — A review enters its own review unit and cannot record a verdict it has not claimed

## goal

A reviewer, however weak the model, never chooses a unit kind and is refused at the tool, at once, when it judges a proposal its pack has not claimed.

## why

PR #1771, a gpt-5.3-codex review pack, shows three defects. (1) Its wip ref is delendai/wip/gpt-5.3-codex/implement/batch-all-g1/work: the review was entered with kind implement and topic work, while its publication is .../review/batch-all-g1/verdicts. work enter defaults kind to implement and trusts --kind, so a model that calls it directly gets the wrong unit. (2) The pack recorded a verdict on x01004 without claiming it; its claims were x01016 and d00418. proposal_review accepted it and only the closed-with-independent-approval lint caught it, on the PR. (3) A review publication's title and summary must come from what it ships: publication-pull-request.service already titles a pack from its verdict commits (x01023 retitles on republish), but only when the unit is a review unit and its commits carry the verdict subject, which defect 1 broke.

## non-goals

- Changing the closed-with-independent-approval lint: it stays as the backstop.
- Touching gpt-5.3-codex's unit, refs or verdicts.

## slices

- global_gate: none

### S1 — work enter derives the review kind
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `packages/core/src/lib/work-units/work-unit-enter.service.spec.ts`
- **Gate**: type
- acceptance:
  - "work enter for proposal batch, or for a proposal in review/, derives kind review and topic verdicts itself; a contradicting --kind is refused naming the right command (review next), and a spec covers each."

### S2 — The review tools enter or reuse the reviewer's review unit
- **Status**: pending
- **Files**: `packages/cli/src/commands/review.command.ts`, `plugins/proposals/src/lib/tools/review-claim.tool.ts`
- **Gate**: type
- acceptance:
  - "review_claim and review_queue, called with no unit, enter or reuse the caller's review unit, so a reviewer never chooses a kind; a spec shows an agent with no unit ending in kind review."

### S3 — proposal_review refuses a verdict on an unclaimed proposal
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/review-verdict-lifecycle.ts`, `plugins/proposals/src/lib/services/pack-governance.service.ts`
- **Gate**: type
- acceptance:
  - "proposal_review submit, approve or request_changes on a proposal the pack has not claimed is refused at once with the review_claim command to run; a spec shows x01004 refused when only x01016 is claimed, and the lint is unchanged."

### S4 — A review pack is titled by its verdicts
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/publication-pull-request.service.ts`, `packages/core/src/lib/work-units/publication-pull-request.service.spec.ts`
- **Gate**: type
- acceptance:
  - "The pull request of a review unit is titled and summarised from the proposals it judges, never implement batch, on first open and on republish; a spec covers a review unit whose branch names batch."

## acceptance

- work enter for proposal batch, or for a proposal in review/, derives kind review and topic verdicts itself; a contradicting --kind is refused naming the right command (review next), and a spec covers each.
- review_claim and review_queue, called with no unit, enter or reuse the caller's review unit, so a reviewer never chooses a kind; a spec shows an agent with no unit ending in kind review.
- proposal_review submit, approve or request_changes on a proposal the pack has not claimed is refused at once with the review_claim command to run; a spec shows x01004 refused when only x01016 is claimed, and the lint is unchanged.
- The pull request of a review unit is titled and summarised from the proposals it judges, never implement batch, on first open and on republish; a spec covers a review unit whose branch names batch.
