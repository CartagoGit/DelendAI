---
id: x00765
title: "close_slice runs the project's declared gate asynchronously and never counts a timeout as green"
kind: fix
status: done
type: proposal
track: general
date: 2026-09-30
last-transition-id: 8db23e2b-4b73-421d-940a-23e366517164
last-correlation-id: 8db23e2b-4b73-421d-940a-23e366517164
last-transition-from: review
shipped-in:
  - "cd6e1d3ca645f0cf63fe30f625217710797f4ad5"
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
- review-reviewer: MiniMax-M3
- review-log: approved by MiniMax-M3 — 12/12 close-slice-gate tests green, tsc -p plugins/proposals exit 0. Two delivering commits: cd6e1d3ca645 (merge of claude-sonnet-5-5 branch, +1212/-285 across 18 files) and 73a828df0a5b (chore(generated) post-merge sync). Reviewed on delivered state; later drift in close-slice-gate process/store/tree files is from subsequent proposals, not regressions of this slice.

## acceptance

- a gate longer than the old timeout returns pending with a handle, not failure and not pass
- a recorded green result for the same tree is reused
- a failing gate blocks the close
- a timed-out or crashed gate is unverifiable and never green
