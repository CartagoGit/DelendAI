---
id: f00797
title: "One command proves, hands over and publishes a unit"
kind: feat
status: in-progress
type: proposal
track: ci
date: 2026-10-31
last-transition-id: 5242df50-2856-4ce7-bee9-a4267892cdc9
last-correlation-id: 5242df50-2856-4ce7-bee9-a4267892cdc9
last-transition-from: ready
last-transition-at: 2026-10-31T23:35:03.052Z
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
- **Files**: `packages/cli/src/lib/work-deliver.service.ts`, `packages/cli/src/lib/work-deliver.service.spec.ts`, `packages/cli/src/commands/work.command.ts`, `packages/cli/src/contracts/constants/work-command.constant.ts`, `packages/core/src/lib/work-units/work-unit-prove.service.ts`, `packages/core/src/lib/development-policy/declare-workflow.ts`
- **Gate**: type
- acceptance:
  - "`work deliver --proposal=<id> --agent=<you>` proves the unit, moves the proposal to in-progress and review from the unit's worktree, stops with the reason of the first refusal, touches nothing when the proof fails, and only publishes a proposal already in review (work-deliver.service.spec.ts). The workflow every agent receives names it."

## acceptance

- `work deliver --proposal=<id> --agent=<you>` proves the unit, moves the proposal to in-progress and review from the unit's worktree, stops with the reason of the first refusal, touches nothing when the proof fails, and only publishes a proposal already in review (work-deliver.service.spec.ts). The workflow every agent receives names it.
