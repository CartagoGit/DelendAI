---
id: x00944
title: "A transition, close or review accepts only evidence it checked"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 47ae67c1-9949-4f0b-893b-4830b4e388ef
last-correlation-id: 47ae67c1-9949-4f0b-893b-4830b4e388ef
last-transition-from: in-progress
last-transition-at: 2026-10-24T04:15:36.932Z
shipped-in:
  - "9448dd3a77490eefdc4041d1e7154425401f03d5"
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
- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`, `plugins/proposals/src/lib/tools/recovery-tools.ts`, `plugins/proposals/src/lib/services/proposal-state.ts`, `plugins/proposals/src/lib/contracts/constants/forced-transition.constant.ts`, `plugins/proposals/src/lib/contracts/interfaces/forced-transition.interface.ts`, `plugins/proposals/src/index.ts`
- **Gate**: type
- acceptance:
  - "force:true and proposal_force_transition require a reason, write a bypass record naming the skipped gates, and are refused when the caller is an agent and the project's policy reserves force to people (D5)."
  - "A spec shows each skipped gate listed in the record."
- shipped-in: `dddf5d31a4df`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: claude-sonnet-5-5
- review-log: approved by claude-sonnet-5-5 — verified at 9448dd3a7749, validate exit 0 and tests 184/184 claimed, no recorded run cited; acceptance 2/2: (1) proposal-transition.tool.spec 'refuses force when the project reserves it to people, and records nothing' and proposal_force_transition tests pass (reason, who… (2) proposal-state.spec 'lists every gate a forced close from review passes without', 'leaves out a gate the project turned off' pass — verified by code reading and spec runs

### S2 — Evidence is the run the server recorded
- **Status**: done
- **Files**: `plugins/proposals/src/lib/services/review-verdict-evidence.ts`, `plugins/proposals/src/lib/contracts/interfaces/recorded-run.interface.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/lib/tools/review-claim.tool.ts`, `plugins/proposals/src/lib/shared/peer-review-log.ts`, `plugins/proposals/src/lib/tools/proposal-get.tool.ts`, `apps/web/src/i18n/tools/delendai_proposals_proposal_review.ts`
- **Gate**: type
- acceptance:
  - "close_slice with evidence whose validate run failed is refused (PROP-EVIDENCE01)."
  - "proposal_review approve that claims a validate or test run cites a run id from the run journal of its checkout; a claim with no matching recorded run, or a run that is not validate, is refused or recorded as unverified, never as 'validate exit 0'."
  - "A review whose run could not execute can be recorded as 'could not verify' with the reason, distinct from request changes (G33)."
- shipped-in: `2819f578649c`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: claude-sonnet-5-5
- review-log: approved by claude-sonnet-5-5 — verified at 9448dd3a7749, validate exit 0 and tests 184/184 claimed, no recorded run cited; acceptance 3/3: (1) close-slice-validation.spec 'does not close on inline evidence of a validate run that failed' passes (2) review-verdict-evidence.spec 'names the run it cites, and is refused for a run the journal lacks or that failed' + review-claim.tool.spec pass (3) review-claim.tool.spec 'records a claim given back as could not verify, with the reason, and no verdict' passes — verified by code reading and spec runs

### S3 — Review policy reaches every closing path
- **Status**: done
- **Files**: `plugins/proposals/src/lib/tools/review-verdict-lifecycle.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/index.ts`
- **Gate**: type
- acceptance:
  - "requireValidateEvidence from the plugin options reaches the transition handler (PROP-CONFIG01)."
  - "The auto-close after the last approval applies the instance-independence policy; two instances of one model do not count as two reviewers when the policy says so (PROP-REVIEW01)."
- shipped-in: `dddf5d31a4df`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- force:true and proposal_force_transition require a reason, write a bypass record naming the skipped gates, and are refused when the caller is an agent and the project's policy reserves force to people (D5).
- A spec shows each skipped gate listed in the record.
- close_slice with evidence whose validate run failed is refused (PROP-EVIDENCE01).
- proposal_review approve that claims a validate or test run cites a run id from the run journal of its checkout; a claim with no matching recorded run, or a run that is not validate, is refused or recorded as unverified, never as 'validate exit 0'.
- A review whose run could not execute can be recorded as 'could not verify' with the reason, distinct from request changes (G33).
- requireValidateEvidence from the plugin options reaches the transition handler (PROP-CONFIG01).
- The auto-close after the last approval applies the instance-independence policy; two instances of one model do not count as two reviewers when the policy says so (PROP-REVIEW01).
