---
id: x01048
title: "Concurrent work enter reads git state a sibling entry has since changed: forget the invocation memo once the unit is held"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-08
last-transition-id: c565a576-0556-483f-92a6-3fc404f8191c
last-correlation-id: c565a576-0556-483f-92a6-3fc404f8191c
last-transition-from: in-progress
last-transition-at: 2026-11-08T02:12:56.119Z
---

# x01048 — Concurrent work enter reads git state a sibling entry has since changed: forget the invocation memo once the unit is held

## goal

Two sessions entering one unit together each get a unit (g1 and g2) every time. An entry forgets the invocation's remembered git reads the moment it holds the unit, so it sees the ref and worktree the entry before it just made.

## why

Cause: the per-invocation git read memo (x01034 S4) answered the second concurrent enter's ref and worktree reads from before it waited for the first, so it picked g1 again, worktree add failed and it was refused (exit 4). develop is red on work-unit.service.e2e.spec.ts (x00731).

## non-goals

- Nothing else about the git read memo changes: it still answers repeats within an invocation; it only forgets when the invocation takes a work-ref lock.

## slices

- global_gate: none

### S1 — Entry forgets memoised git reads once it holds the unit
- **Status**: review
- **Files**: `packages/core/src/lib/wip-engine/work-ref-lock.ts`, `packages/core/tests/src/lib/work-units/work-unit.service.e2e.spec.ts`
- **Gate**: type
- acceptance:
  - "After acquiring the unit, holdWorkRef calls forgetGitReads on acquiring so the generation is chosen from the repository as the previous entry left it."
  - "A spec proves a memoised ref list taken before the wait is not used after it."
- shipped-in: `258f873b0d16`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- After acquiring the unit, holdWorkRef calls forgetGitReads on acquiring so the generation is chosen from the repository as the previous entry left it.
- A spec proves a memoised ref list taken before the wait is not used after it.
