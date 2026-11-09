---
id: f00797
title: "One command proves, hands over and publishes a unit"
kind: feat
status: ready
type: proposal
track: ci
date: 2026-10-31
last-transition-id: 4b0521ad-b091-4517-a999-c7a31dc48183
last-correlation-id: 4b0521ad-b091-4517-a999-c7a31dc48183
last-transition-from: review
last-transition-at: 2026-11-04T15:34:37.231Z
---

# f00797 — One command proves, hands over and publishes a unit

## goal

An agent delivers a unit with one command: the product proves it, hands it to review and publishes it, in the right order, and stops at the first refusal.

## why

Delivering took four commands in an order each agent had to remember: `work prove`, two `proposals transition` calls, and `work publish` when the proposal was already in review. Over one session the transitions alone were 381 calls. Each step is a call to pay for and a place to go wrong, and agents on other hosts skip steps (x00990). The order is the product's to know.

## non-goals

- A new tool on the MCP surface: the command lives in the CLI, where the unit engine and the proposals tool meet, because core may not name a proposals tool.
- Removing the separate commands, which stay for a step taken alone.

## slices

- global_gate: type

### S1 — `work deliver`
- **Status**: pending
- **Files**: `packages/cli/src/lib/work-deliver.service.ts`, `packages/cli/src/lib/work-deliver.service.spec.ts`, `packages/cli/src/commands/work.command.ts`, `packages/cli/src/contracts/constants/work-command.constant.ts`, `packages/core/src/lib/work-units/work-unit-prove.service.ts`, `packages/core/src/lib/development-policy/declare-workflow.ts`, `tools/scripts/lint/proposal-hygiene.script.ts`, `tools/scripts/lint/proposal-hygiene.spec.ts`
- **Gate**: type
- acceptance:
  - "`work deliver --proposal=<id> --agent=<you>` moves the proposal to in-progress, from review too, proves the unit and hands it to review from the unit's worktree. It finds the unit's worktree itself, so it works from any directory, stops with the tool's own reason for the first refusal, hands nothing over when the proof fails, and names the publication it made (work-deliver.service.spec.ts, work.command.spec.ts). The workflow every agent receives names it."
- shipped-in: `6062f28705db`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — The shipped-in commit 6062f28705db is a narrow refactor that moves the deliver ports interface and updates imports. It does not deliver the S1 acceptance behavior (`work deliver` proving, transitioning proposal state, handing over to review from the unit worktree, failure-stop semantics, and publication naming) nor the listed file-scope changes in core/lint/workflow. Repro: `git show --name-only 6062f28705db` and compare with the S1 Files + acceptance section in f00797.

## acceptance

- `work deliver --proposal=<id> --agent=<you>` moves the proposal to in-progress, from review too, proves the unit and hands it to review from the unit's worktree. It finds the unit's worktree itself, so it works from any directory, stops with the tool's own reason for the first refusal, hands nothing over when the proof fails, and names the publication it made (work-deliver.service.spec.ts, work.command.spec.ts). The workflow every agent receives names it.

## notes

Reopened 2026-11-01: a failed delivery kept only the tail of the output, which named no cause, so `prove` now prints the failure lines last; and it runs the `tokens-budget-real` gate, whose breach reached a pull request unseen.

- 2026-11-01: the proof runs the budgets, the drift check and the site translations first and stops there when one fails: they answer in under a minute, and a 27-byte overshoot cost eleven minutes before.

- 2026-11-02: the cheap checks also run at the commit, chosen by what it touches, in about 2 s: the agent notes are regenerated and staged, and casts, contracts, conventions and SOLID answer there; the budget and the site translations join when a tool can have changed.
