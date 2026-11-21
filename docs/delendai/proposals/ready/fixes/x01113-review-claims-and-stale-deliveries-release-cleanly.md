---
id: x01113
title: "Review claims and stale deliveries release cleanly"
kind: fix
status: ready
type: proposal
track: review-mechanics
date: 2026-11-21
---

# x01113 — Review claims and stale deliveries release cleanly

## goal

Prevent stale review assignments and stale delivery snapshots from blocking or contaminating peer review.

## why

During autonomous review, retiring a review unit left x01016 held by the same agent and review_claim refused it in a later batch. Independently, several review candidates remained in need-verdict while declared Files had moved or deleted and review evidence pointed to older commits. The queue therefore allowed stale or blocked work to be reconsidered without an explicit freshness/fresh-claim release.

## non-goals

- Removing independent peer review
- Accepting or changing review verdict semantics without evidence
- Hand-editing proposal or review state

## slices

- global_gate: type

### S1 — Release and quarantine stale review assignments
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/services/review-claim.service.ts`, `plugins/proposals/src/lib/tools/review-claim.tool.ts`, `plugins/proposals/tests/src/lib/tools/review-claim.tool.spec.ts`, `plugins/proposals/tests/src/lib/services/review-claim-timeout.spec.ts`
- **Gate**: type
- **Decisions**: Define claim-release invariants for unit retire, work reap, and repeated claim: no delivered review unit may remain held after it is retired.
- acceptance:
  - "A Scenario in review-claim.tool.spec.ts proves retiring or reaping a review unit releases its proposal assignment."
  - "A Scenario in review-claim-timeout.spec.ts proves an expired or abandoned claim is not held by a former unit."
  - "A Scenario in review-claim.tool.spec.ts proves a stale refusal names the former owner and the exact next action instead of leaving the queue item silently blocked."

### S2 — Reject stale delivery snapshots in review
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/authoring/proposal-review.tool.ts`, `plugins/proposals/src/lib/tools/authoring/review-verdict-support.tool.ts`, `plugins/proposals/tests/src/lib/tools/review-verdict-evidence.spec.ts`, `plugins/proposals/tests/src/lib/tools/review-verdict-lifecycle.spec.ts`
- **Gate**: type
- **Decisions**: Classify a delivery as stale when declared Files changed or disappeared after the shipped commit, or when an effective merge commit supersedes the shipped commit.
- acceptance:
  - "A Scenario in review-verdict-evidence.spec.ts proves stale Files or commit drift returns verifiable=false and blocks approval."
  - "A Scenario in review-verdict-lifecycle.spec.ts proves a needs-verdict slice with stale delivery is sent back instead of accepted by green evidence."
  - "A Scenario in review-verdict-evidence.spec.ts proves declared-path renames/deletions and effective re-delivery commit selection block stale approval."

## acceptance

- A Scenario in review-claim.tool.spec.ts proves retiring or reaping a review unit releases its proposal assignment.
- A Scenario in review-claim-timeout.spec.ts proves an expired or abandoned claim is not held by a former unit.
- A stale claim refusal names the former owner and the exact next action instead of leaving the queue item silently blocked.
- A Scenario in review-verdict-evidence.spec.ts proves stale Files or commit drift returns verifiable=false and blocks approval.
- A Scenario in review-verdict-lifecycle.spec.ts proves a needs-verdict slice with stale delivery is sent back instead of accepted by green evidence.
- A Scenario in review-verdict-evidence.spec.ts proves declared-path renames/deletions and effective re-delivery commit selection block stale approval.
