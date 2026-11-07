---
id: f00806
title: "A proposal's state separates implemented, proved, reviewed, integrated and released"
kind: feat
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-11-04
last-transition-id: 55e7d4cc-8c14-47ed-8343-435df3327971
last-correlation-id: 55e7d4cc-8c14-47ed-8343-435df3327971
last-transition-from: ready
last-transition-at: 2026-11-07T12:22:45.497Z
---

# f00806 — A proposal's state separates implemented, proved, reviewed, integrated and released

## goal

Each slice and proposal says which of implemented, proved, reviewed, integrated and released it has reached, read from the fields already recorded (`Status`, `review-state`, `shipped-in`, the integration and release branches), so a slice awaiting review is not shown as pending. First, the verdict itself sets where a reviewed proposal stands: nobody moves it by hand.

## why

External audit (ChatGPT, 2026-11-04, against develop f7f53bf8d), finding 7. Claim: proposal state conflates stages, so a slice that is finished and only awaits review reads as pending. Verified in part: proposals carry a single `Status` per slice plus separate `review-state`, `shipped-in` and `last-transition` fields, as in x00995; the stages are spread over unrelated fields and no one place states them.

Owner-reported defect, 2026-11-05: the gpt-5.3-codex reviewer recorded `request_changes` verdicts, saw the review queue unchanged, and ran `proposal_force_transition` to `in-progress` on ten proposals (d00418, f00795, f00796, f00797, v00138, v00142, x00989, x01006, x01011, x01019; PR #1802). The verdict had moved each one `review -> ready` itself, and the queue still read the shared checkout, where they waited. The owner's rule: a proposal sent back stays at status `review` with its slices' `review-state: changes_requested`; the implementer works on it there; approval goes on to closing; a reviewer never moves it by hand.

## non-goals

- New status values or new review-state values: the existing `review` status and the `review-state` values (`in_review`, `changes_requested`, `done`) carry every stage.
- Changing the proposal state machine's transitions.
- Editing gpt-5.3-codex's units or verdicts: the repair reads them only.

## slices

- global_gate: none

### S1 — The verdict is the move
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/swarm/proposal-stage.ts`, `plugins/proposals/src/lib/tools/authoring/review-round.tool.ts`, `plugins/proposals/src/lib/tools/authoring/proposal-review.tool.ts`, `plugins/proposals/src/lib/tools/review-verdict-lifecycle.ts`, `plugins/proposals/src/lib/contracts/interfaces/review-round.interface.ts`, `plugins/proposals/src/lib/contracts/interfaces/review-verdict-lifecycle.interface.ts`, `plugins/proposals/src/lib/contracts/constants/review-tool-schema.constant.ts`, `plugins/proposals/src/lib/services/review-attribution.ts`, `plugins/proposals/src/lib/services/review-queue.service.ts`, `plugins/proposals/src/lib/contracts/interfaces/review-queue.interface.ts`, `plugins/proposals/src/lib/contracts/constants/review-queue-schema.constant.ts`, `plugins/proposals/src/lib/services/review-unit-tree.service.ts`, `plugins/proposals/src/lib/tools/review-queue.tool.ts`, `plugins/proposals/src/lib/tools/continue-proposal.tool.ts`, `plugins/proposals/src/lib/tools/auto-work.tool.ts`, `plugins/proposals/src/lib/tools/auto-work/planning.tool.ts`, `plugins/proposals/src/lib/services/reviewer-move-guard.service.ts`, `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`, `plugins/proposals/src/lib/contracts/interfaces/proposal-transition-tool.interface.ts`, `plugins/proposals/src/lib/tools/recovery-tools.ts`, `plugins/proposals/src/lib/wiring/proposals-tools.register.ts`, `tools/scripts/lint/proposal-slice-completeness.script.ts`, `plugins/proposals/tests/src/lib/swarm/proposal-stage.spec.ts`, `plugins/proposals/tests/src/lib/services/reviewer-move-guard.service.spec.ts`, `plugins/proposals/tests/src/lib/tools/auto-work/planning.tool.spec.ts`, `plugins/proposals/tests/src/lib/tools/proposal-review-sent-back.spec.ts`, `plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts`, `plugins/proposals/tests/src/lib/tools/review-queue-swarm.tool.spec.ts`, `plugins/proposals/tests/src/lib/tools/review-queue-candidates.spec.ts`, `tools/scripts/lint/proposal-slice-completeness.script.spec.ts`
- **Gate**: type
- acceptance:
  - "`proposal_review request_changes` leaves the proposal at status `review` in `review/`, its slice `pending` with `review-state: changes_requested`, and answers with the next action; it never moves it to `ready` or `in-progress`."
  - "An approval that completes the proposal closes it (`review -> done`); one that leaves a slice sent back keeps it in review."
  - "`review_queue` takes a proposal sent back off the queue and counts its sent-back slices in `totals.waitingOnImplementer`; a reviewer that names only itself reads its one review unit, so its own verdicts update its queue."
  - "`auto_work` hands a proposal in review that was sent back to an implementer, not to a reviewer."
  - "`proposal_transition` and `proposal_force_transition` refuse an agent holding a verdict on the proposal (or any call from a review unit whose agent holds one), naming the verdicts and what they already did."
  - "`lint:proposal-slice-completeness` accepts a pending slice with `review-state: changes_requested` in `review/`."

### S2 — A repair returns proposals a reviewer moved out of review
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/lib/services/review-restore.service.ts`, `plugins/proposals/src/lib/contracts/interfaces/review-restore.interface.ts`, `plugins/proposals/src/lib/tools/review-restore.ts`, `plugins/proposals/src/lib/tools/recovery-tools.ts`, `apps/web/src/i18n/tools/delendai_proposals_proposal_review.ts`, `plugins/proposals/tests/src/lib/services/review-restore.service.spec.ts`, `plugins/proposals/tests/src/lib/tools/review-restore.spec.ts`
- **Gate**: type
- acceptance:
  - "`proposal_reconcile_folder` with no id (dry run by default, in its own `wouldChange` shape) lists each proposal in `in-progress/` whose slices were all handed in, none taken up since, and whose review-state is `in_review` or `changes_requested`, with its slices' review-state and the reviewers that sent it back; run, it moves status and folder to `review` only. No new tool: the proposals plugin stays under its 80,000 B hard budget."
  - "Its dry run over PR #1802's tree lists the ten proposals gpt-5.3-codex forced, and lists none on develop."

### S3 — The stage of a slice is derived from recorded facts
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `plugins/proposals/src/lib/swarm/slice-stage.ts`, `plugins/proposals/src/lib/contracts/interfaces/slice-stage.interface.ts`, `plugins/proposals/tests/src/lib/swarm/slice-stage.spec.ts`
- **Gate**: type
- acceptance:
  - "A pure function maps a slice to pending, in-progress, implemented, proved, in_review, changes_requested, reviewed, integrated, released or retired from its recorded facts (`Status`, `review-state`, `shipped-in`, a passed proof, the delivering commit on the integration and on the release branch); specs cover one slice per stage and a slice awaiting review."

### S4 — Boards and status show the stage
- **Status**: pending
- **DependsOn**: [S3]
- **Files**: `plugins/proposals/src/lib/tools/proposal-board.tool.ts`, `plugins/proposals/src/lib/services/slice-stage-facts.service.ts`, `plugins/proposals/src/lib/swarm/proposal-stage.ts`, `plugins/proposals/tests/src/lib/tools/proposal-board-stage.spec.ts`, `plugins/proposals/tests/src/lib/services/slice-stage-facts.service.spec.ts`
- **Gate**: type
- acceptance:
  - "`proposal_board`, whenever it shows slices (proposalId, detail or progress), shows each pending slice's stage in its `status` (in_review, changes_requested, implemented…) and the proposal's `stages` counts; git is asked once per delivering commit and branch, and never for the brief board. No proof record is read yet: `proved` stays false until a unit's proof verdict is recorded where the board can read it."

## acceptance

- A change request leaves the proposal at status `review` with `review-state: changes_requested`, the queue updates from the verdict alone, and a reviewer's manual transition on a proposal it judged is refused.
- A dry-run repair lists the proposals a reviewer moved out of review, and returns them to `review` with their recorded review-state.
- Each slice's stage is derived from the recorded fields and shown on the board, with counts per stage.
