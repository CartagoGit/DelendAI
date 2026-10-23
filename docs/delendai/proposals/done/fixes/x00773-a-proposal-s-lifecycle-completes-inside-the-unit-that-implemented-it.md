---
id: x00773
title: "A proposal's lifecycle completes inside the unit that implemented it"
kind: fix
status: done
type: proposal
track: general
date: 2026-09-30
last-transition-id: 1aaeeded-333b-4626-a2b7-de4cd7248954
last-correlation-id: 1aaeeded-333b-4626-a2b7-de4cd7248954
last-transition-from: review
shipped-in:
  - "97e521a46"
---

# x00773 — A proposal's lifecycle completes inside the unit that implemented it

## Goal

An agent that creates a proposal and implements it in a work unit can hand it to review, and move its slices, from that unit, under every profile: the move is written in the unit's tree, rides with the pull request or the merge, and lands directly under a direct profile.

## why

A proposal created or implemented in a unit exists only on that unit's ref until its work lands. The tools that move its lifecycle (`proposal_transition`, `close_slice`, the review tools) act in the tree the call names, and a call from the shared checkout on the integration branch is refused, so every agent had to find out, one refusal at a time, that the worktree has to be passed as `checkout`. Publishing then ends the unit, and with it the only tree the hand-off could be made in: proposals sit in `ready` with their slices `pending`, and agents edit statuses by hand.

## Architecture

- A call about a proposal (`id`, `proposalId` or `proposal`) that would be refused in the shared checkout acts instead in the one live implementation (else creation) unit that carries that proposal, for the agent named when one is. The move is committed in the unit by the same write commit every caller-checkout tool gets, so it lands with the pull request under a pull-request strategy, with the merge under a merge strategy, and the unit is the place where it is written under a worktree strategy. More than one candidate is never guessed: the refusal lists them. A project with no work-ref model commits directly, and its tools act where the proposal is.

## non-goals

- Gating `close_slice` or changing what the hand-off requires.
- Performing the hand-off inside `work publish`, or advising it there: core stays agnostic of the proposals plugin, and the hand-off records review rounds under the agent making it. Being in the unit is what makes the hand-off possible; the tools now find the unit on their own.

## Slices

- global_gate: none

### S1 — Proposal tools act in the unit that carries the proposal
- **Status**: done
- **Files**:
  - `packages/core/src/lib/contracts/interfaces/live-proposal-unit.interface.ts`
  - `packages/core/src/lib/work-units/proposal-branch.service.ts`
  - `packages/core/src/lib/development-policy/project-branches.ts`
  - `packages/core/src/lib/shared/bind-write-root.ts`
  - `packages/core/tests/src/lib/shared/bind-write-root.spec.ts`
  - `packages/core/tests/src/lib/work-units/proposal-branch.service.spec.ts`
  - `plugins/proposals/tests/src/lib/e2e/assembled-proposals-server.ts`
  - `plugins/proposals/tests/src/lib/e2e/proposal-lifecycle-in-unit.e2e.spec.ts`
- **Gate**: type
- shipped-in: `97e521a4668f`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at 97e521a46, validate exit 0, tests 37/37 — Delivered by #704 (merge 97e521a46). Proposal acceptance: proposal-lifecycle-in-unit.e2e.spec runs 'moves the proposal in the unit that carries it, and commits it there' for shared-checkout-pr, shared-checkout-merge and worktree-pr, asserting the shared checkout stays clean and holds no commit of it; 'proposal lifecycle in a project that commits directly' covers shared-direct; 'does not guess between two units that carry the proposal' and bind-write-root.spec 'refuses, naming the candidates, when several units carry it'. Core specs 30/30, e2e 7/7.

## acceptance

- From the shared checkout on the integration branch, `proposal_transition` for a proposal only a unit carries moves it in that unit and commits it there, under shared-checkout-pr, shared-checkout-merge and worktree-pr, with the shared checkout untouched.
- Under shared-direct the move is made where the proposal is.
- Two units carrying the proposal are refused with both paths named.
