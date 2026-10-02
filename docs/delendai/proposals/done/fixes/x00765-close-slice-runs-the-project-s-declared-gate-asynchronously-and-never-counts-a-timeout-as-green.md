---
id: x00765
title: "close_slice runs the project's declared gate asynchronously and never counts a timeout as green"
kind: fix
status: done
type: proposal
track: general
date: 2026-09-30
last-transition-id: e176b936-0b80-4448-9e61-0bb9370268be
last-correlation-id: e176b936-0b80-4448-9e61-0bb9370268be
last-transition-from: review
shipped-in:
  - "2051dfc71"
---

# x00765 — close_slice runs the project's declared gate asynchronously and never counts a timeout as green

## Goal

close_slice's quality gate runs the gate the project declares (validationMatrix.scopes filtered to the slice scopes, else its validate script) as a background job keyed by the exact tree, returns a pending handle the agent resumes, reuses a recorded green result for the same tree, and reports a timeout or crashed run as unverifiable rather than pass or fail.

## why

The gate ran the whole validate chain synchronously inside the proposal file mutex with a hard 45 s tool timeout, and parsed a JSON report this repo's validate script never prints, so close_slice could not close any slice and agents edited slice statuses by hand.

## non-goals

- Changing the development-policy or work-units
- Changing the meaning of peer review or validate evidence

## Slices

- global_gate: none

### S1 — Async tree-keyed close_slice gate
- **Status**: done
- **Files**: `packages/core/src/public/index.ts`, `plugins/proposals/src/index.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/lib/tools/authoring-options.ts`, `plugins/proposals/src/lib/tools/close-slice-gate.ts`, `plugins/proposals/src/lib/tools/close-slice-gate-store.ts`, `plugins/proposals/tests/src/lib/tools/close-slice-gate.spec.ts`, `plugins/proposals/tests/src/lib/e2e/quality-close-slice.e2e.spec.ts`, `plugins/proposals/src/lib/tools/close-slice-gate-process.ts`, `plugins/proposals/src/lib/tools/close-slice-gate-tree.ts`, `plugins/proposals/src/generated/tool-outputs.ts`
- **Gate**: type
- acceptance:
  - "a gate longer than the old timeout returns pending with a handle, not failure and not pass"
  - "a recorded green result for the same tree is reused"
  - "a failing gate blocks the close"
  - "a timed-out or crashed gate is unverifiable and never green"
- shipped-in: `cd6e1d3ca645`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — x00765 S1 delivered at 2051dfc71 (the actual feat commit; cd6e1d3ca645 is a merge conflict resolution): close_slice now reads the project's declared gate (validationMatrix filtered to slice scopes, else validate), runs it detached keyed by the exact tree, returns a pending handle, reuses a green result for the same tree and reports a timeout or crashed run as unverifiable. close-slice-gate.spec.ts + quality-close-slice.e2e.spec.ts — 15/15 green. Non-goals (development-policy, work-units, peer review meaning) untouched.

## acceptance

- a gate longer than the old timeout returns pending with a handle, not failure and not pass
- a recorded green result for the same tree is reused
- a failing gate blocks the close
- a timed-out or crashed gate is unverifiable and never green
