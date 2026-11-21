---
id: x01117
title: "create_proposal refuses a checkout that is another unit's worktree and names its owner"
kind: fix
status: review
type: proposal
track: trust
date: 2026-11-21
last-transition-id: 656ae148-bb91-4171-bfe5-f40476581a30
last-correlation-id: 656ae148-bb91-4171-bfe5-f40476581a30
last-transition-from: in-progress
last-transition-at: 2026-11-21T06:13:37.902Z
---

# x01117 — create_proposal refuses a checkout that is another unit's worktree and names its owner

## goal

create_proposal (@delendai/core 0.3.0) refuses a caller checkout whose work unit has a different kind or a different allocated proposal, naming the owning unit and how to enter one's own, instead of writing and auto-committing into it.

## why

A worker passed a checkout path read from a temp file another worker had overwritten; the proposal was written and auto-committed into ANOTHER unit's worktree on another proposal's branch. proposalOfCreateUnit only refuses a create unit that already made a proposal, so a unit of any other kind is accepted.

## non-goals

- Changing which checkouts non-unit trees may write to
- Changing transition or close_slice checkout handling

## slices

- global_gate: none

### S1 — Refuse a foreign unit checkout in create_proposal
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/unit-adoption.service.ts`, `packages/core/src/runtime/index.ts`, `plugins/proposals/src/lib/tools/authoring/create-proposal.tool.ts`, `packages/core/tests/src/lib/work-units/unit-adoption.service.spec.ts`, `plugins/proposals/tests/src/lib/tools/authoring/create-proposal.tool.spec.ts`, `packages/core/src/lib/contracts/interfaces/foreign-unit.interface.ts`, `plugins/proposals/tests/src/lib/tools/create-proposal-publishes.e2e.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "packages/core/tests/src/lib/work-units/unit-adoption.service.spec.ts: [<200ms] foreignUnitOf names the unit of a different kind or proposal and finds nothing for a create unit or a non-unit tree"
  - "plugins/proposals/tests/src/lib/tools/authoring/create-proposal.tool.spec.ts: [<200ms] create_proposal refuses a checkout owned by another unit, naming it and the work enter command"
- shipped-in: `b9b6e15c9909`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- packages/core/tests/src/lib/work-units/unit-adoption.service.spec.ts: [<200ms] foreignUnitOf names the unit of a different kind or proposal and finds nothing for a create unit or a non-unit tree
- plugins/proposals/tests/src/lib/tools/authoring/create-proposal.tool.spec.ts: [<200ms] create_proposal refuses a checkout owned by another unit, naming it and the work enter command
