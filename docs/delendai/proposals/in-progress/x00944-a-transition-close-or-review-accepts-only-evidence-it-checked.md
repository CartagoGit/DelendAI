---
id: x00944
title: "A transition, close or review accepts only evidence it checked"
kind: fix
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: b9d6a764-f6b2-408d-8435-255135d3980e
last-correlation-id: b9d6a764-f6b2-408d-8435-255135d3980e
last-transition-from: ready
last-transition-at: 2026-10-24T03:59:22.791Z
---

# x00944 — A transition, close or review accepts only evidence it checked

## goal

Forcing a transition leaves a record and needs a reason a person can audit, close_slice never turns failed validation into accepted evidence, a reviewer's 'validate exit 0' is checked against the run the server recorded, and review policy reaches every path that closes a proposal.

## why

Joint audit a00095. D5: force:true and proposal_force_transition skip the gates with no brake. gpt-6.1-sol PROP-EVIDENCE01: close_slice turns failed validation evidence into accepted explicit evidence. Sol PROP-CONFIG01: the plugin does not forward requireValidateEvidence to its transition handler. Sol PROP-REVIEW01: review auto-close drops the configured instance-independence policy. G33: a review that could not run can only be recorded as 'request changes'. Reviewer evidence observed during this audit (minimax-m3.1-flash-preview, 2026-10-22/23): approvals logged 'validate exit 0, tests 9/9' two minutes after the claim, when the reviewer's own run journal shows only one vitest file ran; proposal_review accepts the free-text claim.

## non-goals

- Who may review (the agent-discipline proposal).
- Lock and claim races (x00942).

## slices

- global_gate: type

### S1 — Forcing a transition is recorded and bounded
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`, `plugins/proposals/src/lib/surface/disclosure.ts`
- **Gate**: type
- acceptance:
  - "force:true and proposal_force_transition require a reason, write a bypass record naming the skipped gates, and are refused when the caller is an agent and the project's policy reserves force to people (D5)."
  - "A spec shows each skipped gate listed in the record."

### S2 — Evidence is the run the server recorded
- **Status**: pending
- **Files**: `packages/core/src/lib/proposals/validate-evidence.schema.ts`, `plugins/proposals/src/lib/services/transition-evidence.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`
- **Gate**: type
- acceptance:
  - "close_slice with evidence whose validate run failed is refused (PROP-EVIDENCE01)."
  - "proposal_review approve that claims a validate or test run cites a run id from the run journal of its checkout; a claim with no matching recorded run, or a run that is not validate, is refused or recorded as unverified, never as 'validate exit 0'."
  - "A review whose run could not execute can be recorded as 'could not verify' with the reason, distinct from request changes (G33)."

### S3 — Review policy reaches every closing path
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/shared/independent-approval.ts`, `plugins/proposals/src/lib/tools/review-verdict-lifecycle.ts`, `plugins/proposals/src/lib/contracts/surfaces/proposal-read.contract.ts`, `plugins/proposals/src/index.ts`
- **Gate**: type
- acceptance:
  - "requireValidateEvidence from the plugin options reaches the transition handler (PROP-CONFIG01)."
  - "The auto-close after the last approval applies the instance-independence policy; two instances of one model do not count as two reviewers when the policy says so (PROP-REVIEW01)."

## acceptance

- force:true and proposal_force_transition require a reason, write a bypass record naming the skipped gates, and are refused when the caller is an agent and the project's policy reserves force to people (D5).
- A spec shows each skipped gate listed in the record.
- close_slice with evidence whose validate run failed is refused (PROP-EVIDENCE01).
- proposal_review approve that claims a validate or test run cites a run id from the run journal of its checkout; a claim with no matching recorded run, or a run that is not validate, is refused or recorded as unverified, never as 'validate exit 0'.
- A review whose run could not execute can be recorded as 'could not verify' with the reason, distinct from request changes (G33).
- requireValidateEvidence from the plugin options reaches the transition handler (PROP-CONFIG01).
- The auto-close after the last approval applies the instance-independence policy; two instances of one model do not count as two reviewers when the policy says so (PROP-REVIEW01).
