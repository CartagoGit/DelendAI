---
id: x01048
title: "Concurrent work enter reads git state a sibling entry has since changed: forget the invocation memo once the unit is held"
kind: fix
status: done
type: proposal
track: general
date: 2026-11-08
last-transition-id: 4103f99b-27d2-4cf8-9071-e0f9cdcc0353
last-correlation-id: 4103f99b-27d2-4cf8-9071-e0f9cdcc0353
last-transition-from: review
last-transition-at: 2026-11-09T21:16:33.381Z
shipped-in:
  - "6eff3ef750dfa762f2dd4463d3942eba2d9f5cea"
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
- **Status**: done
- **Files**: `packages/core/src/lib/wip-engine/work-ref-lock.ts`, `packages/core/tests/src/lib/work-units/work-unit.service.e2e.spec.ts`
- **Gate**: type
- acceptance:
  - "After acquiring the unit, holdWorkRef calls forgetGitReads on acquiring so the generation is chosen from the repository as the previous entry left it."
  - "A spec proves a memoised ref list taken before the wait is not used after it."
- shipped-in: `258f873b0d16`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at 6eff3ef750df, validate exit 0 and tests 2/2 claimed, no recorded run cited; acceptance 2/2: (1) work-ref-lock.ts: .acquire().then(outcome => { if (outcome.kind==='acquired') forgetGitReads() }) (2) work-unit.service.e2e.spec.ts 'chooses the generation from the refs the previous entry left' passes and expects -g2/ for the second entry whose outer memo pred… — Read the diff of 6eff3ef750df: holdWorkRef chains .then on acquire and calls forgetGitReads only when outcome.kind==='acquired' (packages/core/src/lib/wip-engine/work-ref-lock.ts). Later narrowed to forgetUnitGitReads by x01034 S5 (fa4abb5ca), which keeps the intent. The new spec is meaningful: command.run wraps runWorkUnit in its own nested withGitInvocationMemo, so aaaa's writes do not clear the outer memo holding the pre-wait worktree/ref reads; entered() for bbbb is then only correct because acquiring forgets them. Ran the x00731 describe block of work-unit.service.e2e.spec.ts on develop: 2/2 pass; tsc --noEmit -p packages/core exit 0.

## acceptance

- After acquiring the unit, holdWorkRef calls forgetGitReads on acquiring so the generation is chosen from the repository as the previous entry left it.
- A spec proves a memoised ref list taken before the wait is not used after it.
