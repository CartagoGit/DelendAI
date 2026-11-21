---
id: x01111
title: "Work deliver prints its answer after the unit worktree is removed"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-21
last-transition-id: 09c4ab13-9dc3-4157-be02-6b231a866e66
last-correlation-id: 09c4ab13-9dc3-4157-be02-6b231a866e66
last-transition-from: ready
last-transition-at: 2026-11-21T02:05:45.934Z
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
- **Status**: pending
- **Files**: `packages/cli/src/commands/work.command.ts`, `new:packages/cli/src/contracts/interfaces/loaded-once.interface.ts`, `packages/cli/src/commands/work.command.spec.ts`
- **Gate**: none
- **Decisions**: none
- acceptance:
  - "[<50ms] packages/cli/src/commands/work.command.spec.ts: a sizer preloaded before the removal still sizes the answer after it and never loads again"
  - "[<50ms] packages/cli/src/commands/work.command.spec.ts: an answer without preloading loads once"

## acceptance

- [<50ms] packages/cli/src/commands/work.command.spec.ts: a sizer preloaded before the removal still sizes the answer after it and never loads again
- [<50ms] packages/cli/src/commands/work.command.spec.ts: an answer without preloading loads once
