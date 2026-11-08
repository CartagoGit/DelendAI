---
id: x01048
title: "Concurrent work enter reads git state a sibling entry has since changed: forget the invocation memo once the unit is held"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-08
---

# x01048 — Concurrent work enter reads git state a sibling entry has since changed: forget the invocation memo once the unit is held

## goal

Two sessions entering one unit together each get a unit (g1 and g2) every time. An entry forgets the invocation's remembered git reads the moment it holds the unit, so it sees the ref and worktree the entry before it just made.

## why

Cause: the per-invocation git read memo (x01034 S4) answered the second concurrent enter's ref and worktree reads from before it waited for the first, so it picked g1 again, worktree add failed and it was refused (exit 4). develop is red on work-unit.service.e2e.spec.ts (x00731).

## non-goals

- TODO: what this proposal deliberately skips.

## slices

- global_gate: none

### S1 — Entry forgets memoised git reads once it holds the unit
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `packages/core/tests/src/lib/work-units/work-unit-enter.service.spec.ts`
- **Gate**: type
- acceptance:
  - "After acquiring the unit, enteredLocked calls forgetGitReads so the generation is chosen from the repository as the previous entry left it."
  - "A spec proves a memoised ref list taken before the wait is not used after it."

## acceptance

- After acquiring the unit, enteredLocked calls forgetGitReads so the generation is chosen from the repository as the previous entry left it.
- A spec proves a memoised ref list taken before the wait is not used after it.
