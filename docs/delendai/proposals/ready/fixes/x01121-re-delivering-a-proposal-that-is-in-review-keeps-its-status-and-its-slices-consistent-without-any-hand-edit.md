---
id: x01121
title: "Re-delivering a proposal that is in review keeps its status and its slices consistent without any hand edit"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-21
---

# x01121 — Re-delivering a proposal that is in review keeps its status and its slices consistent without any hand edit

## goal

`work deliver` on a unit re-entered to fix a proposal in review leaves the proposal status and every slice Status line consistent, so proposal-hygiene never reports delivered-in-progress and no agent edits a Status line by hand.

## why

Re-delivering a proposal already in review (to fix its PR) failed proposal-hygiene delivered-in-progress: runDelivery in packages/cli/src/lib/work-deliver.service.ts first transitions the proposal to in-progress, while its slices stay at review, and the rule in tools/scripts/lint/proposal-hygiene.script.ts fires on an in-progress proposal whose slices are all delivered. An agent had to hand-edit slice Status lines. Root cause hypothesis: the transition to in-progress does not reopen the slices, and the rule's inHand exemption does not recognise the re-delivering unit. Checked docs/delendai/proposals: x00670 added the rule, x01076 made re-delivery republish; neither keeps statuses consistent during re-delivery.

## non-goals

- Allowing a hand edit of a Status line

## slices

- global_gate: none

### S1 — Deliver reopens and re-closes slice statuses itself on a re-delivery
- **Status**: pending
- **Files**: `packages/cli/src/lib/work-deliver.service.ts`, `packages/cli/src/lib/work-deliver.service.spec.ts`, `tools/scripts/lint/proposal-hygiene.script.ts`, `tools/scripts/lint/proposal-hygiene.spec.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "work-deliver.service.spec.ts: re-delivering a proposal in review ends with the proposal in review and every slice Status consistent with it, and no step of the run needs a hand edit."
  - "proposal-hygiene.spec.ts: during a re-delivery the proof's lint raises no delivered-in-progress for the unit's own proposal, while an unrelated in-progress proposal with all slices delivered is still reported."

## acceptance

- work-deliver.service.spec.ts: re-delivering a proposal in review ends with the proposal in review and every slice Status consistent with it, and no step of the run needs a hand edit.
- proposal-hygiene.spec.ts: during a re-delivery the proof's lint raises no delivered-in-progress for the unit's own proposal, while an unrelated in-progress proposal with all slices delivered is still reported.
