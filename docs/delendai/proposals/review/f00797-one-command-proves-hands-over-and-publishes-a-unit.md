---
id: f00797
title: "One command proves, hands over and publishes a unit"
kind: feat
status: review
type: proposal
track: ci
date: 2026-10-31
last-transition-id: bd9946ef-f4a7-4f13-aa0a-a3f99d71ed84
last-correlation-id: bd9946ef-f4a7-4f13-aa0a-a3f99d71ed84
last-transition-from: in-progress
last-transition-at: 2026-10-31T23:36:48.144Z
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
- **Status**: review
- **Files**: `packages/cli/src/lib/work-deliver.service.ts`, `packages/cli/src/lib/work-deliver.service.spec.ts`, `packages/cli/src/commands/work.command.ts`, `packages/cli/src/contracts/constants/work-command.constant.ts`, `packages/core/src/lib/work-units/work-unit-prove.service.ts`, `packages/core/src/lib/development-policy/declare-workflow.ts`
- **Gate**: type
- acceptance:
  - "`work deliver --proposal=<id> --agent=<you>` proves the unit, moves the proposal to in-progress and review from the unit's worktree, stops with the reason of the first refusal, touches nothing when the proof fails, and only publishes a proposal already in review (work-deliver.service.spec.ts). The workflow every agent receives names it."
- shipped-in: `6062f28705db`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- `work deliver --proposal=<id> --agent=<you>` proves the unit, moves the proposal to in-progress and review from the unit's worktree, stops with the reason of the first refusal, touches nothing when the proof fails, and only publishes a proposal already in review (work-deliver.service.spec.ts). The workflow every agent receives names it.
