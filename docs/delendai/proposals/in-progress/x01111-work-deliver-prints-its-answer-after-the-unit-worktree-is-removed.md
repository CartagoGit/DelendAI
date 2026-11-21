---
id: x01111
title: "Work deliver prints its answer after the unit worktree is removed"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-21
last-transition-id: 4da4e40f-df65-4d54-9047-860609fd93e8
last-correlation-id: 4da4e40f-df65-4d54-9047-860609fd93e8
last-transition-from: review
last-transition-at: 2026-11-21T05:02:19.111Z
---

# x01111 — Work deliver prints its answer after the unit worktree is removed

## goal

work deliver, publish and prove always print their full answer: every module the command needs after the last submit removes the unit worktree is loaded before the removal. Target version 0.1.0.

## why

Seen 3 times: the last submit removes the unit worktree, then the CLI lazily imports packages/cli/src/lib/work-answer-size.service.ts from the deleted path and exits 5 with ENOENT, losing the PR and review transition output.

## non-goals

- Do not change the answer size policy.

## slices

- global_gate: none

### S1 — Preload the answer sizer before the worktree can go
- **Status**: review
- **Files**: `packages/cli/src/commands/work.command.ts`, `new:packages/cli/src/contracts/interfaces/loaded-once.interface.ts`, `packages/cli/src/commands/work.command.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "[<50ms] packages/cli/src/commands/work.command.spec.ts: a sizer preloaded before the removal still sizes the answer after it and never loads again"
  - "[<50ms] packages/cli/src/commands/work.command.spec.ts: an answer without preloading loads once"
- shipped-in: `3c34536b596a`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — Leave the unit worktree before it can be removed
- **Status**: ready
- **Files**: `packages/cli/src/commands/work.command.ts`, `new:packages/cli/src/contracts/interfaces/leave-worktree-ports.interface.ts`, `packages/cli/src/commands/work.command.spec.ts`
- **Gate**: none
- **Decisions**: none
- **DependsOn**: S1
- acceptance:
  - "[<20ms] packages/cli/src/commands/work.command.spec.ts: a deliver or publish run from a unit worktree continues from the shared checkout root"
  - "[<20ms] packages/cli/src/commands/work.command.spec.ts: a run outside a linked worktree keeps its directory"
- shipped-in: `e43263c58364`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- [<50ms] packages/cli/src/commands/work.command.spec.ts: a sizer preloaded before the removal still sizes the answer after it and never loads again
- [<50ms] packages/cli/src/commands/work.command.spec.ts: an answer without preloading loads once
- [<20ms] packages/cli/src/commands/work.command.spec.ts: a deliver or publish run from a unit worktree continues from the shared checkout root
- [<20ms] packages/cli/src/commands/work.command.spec.ts: a run outside a linked worktree keeps its directory
