---
id: x00860
title: "close_slice accepts a certification that already exists for the exact tree"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-01
last-transition-id: 5d074a73-f6b0-47b2-b42c-22412a90aac9
last-correlation-id: 5d074a73-f6b0-47b2-b42c-22412a90aac9
last-transition-from: in-progress
---

# x00860 — close_slice accepts a certification that already exists for the exact tree

## Goal

close_slice closes a slice from evidence that already certifies its exact tree (CI green on the same tree, the merge landing's local certification, or a recorded gate result) and only runs the gate locally when none exists, queueing concurrent local gates on one machine.

## why

In a repo with no validationMatrix close_slice runs the whole validate locally (10 min idle, over 30 min loaded), hits its timeout, the claim expires and slices stay pending although their PRs are green. CI already certified the same tree. The project's configured landing route decides who certifies: the forge for pull-request profiles, the local gate for merge.

## non-goals

- unit lease and liveness
- work-swarm, work-publish, workflow-invariants and work enter
- a new forge client

## Slices

- global_gate: none

### S1 — Existing certification closes the slice; local gates queue
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/close-slice-certification.ts`, `plugins/proposals/src/lib/tools/close-slice-gate.ts`, `plugins/proposals/src/lib/tools/close-slice-gate-store.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/index.ts`, `plugins/proposals/src/lib/contracts/interfaces/close-slice-gate.interface.ts`, `plugins/proposals/src/generated/tool-outputs.ts`, `packages/core/src/lib/work-units/landing-certification-record.service.ts`, `packages/core/src/lib/work-units/work-unit-land.service.ts`, `packages/core/tests/src/lib/work-units/landing-certification-record.service.spec.ts`, `plugins/proposals/tests/src/lib/tools/close-slice-certification.spec.ts`, `plugins/proposals/tests/src/lib/tools/close-slice-gate.spec.ts`
- **Gate**: none
- acceptance:
  - "CI green on a commit with the same tree closes without running the gate"
  - "CI green on a different tree is no evidence"
  - "merge profile closes from the recorded landing certification"
  - "no evidence runs the gate or stays pending or gate-unverifiable"
  - "red CI blocks naming the failing check"
  - "concurrent local gates are bounded and queue"
  - "the served next action names the missing evidence"
- shipped-in: `a037b43dfb9d`
- review-state: in_review
- review-implementer: claude-sonnet-5-5
- review-reviewer: MiniMaxM3
- review-log: approved by MiniMaxM3 — x00860 S1 delivered at a037b43dfb9d: close-slice-certification.ts accepts a CI certification recorded for the exact tree (no gate rerun); merge profile closes from recorded landing certification; concurrent local gates queue; the served next action names the missing evidence. 31/31 tests green across close-slice-certification.spec + close-slice-gate.spec + e2e + landing-certification-record.spec.

## acceptance

- CI green on a commit with the same tree closes without running the gate
- CI green on a different tree is no evidence
- merge profile closes from the recorded landing certification
- no evidence runs the gate or stays pending or gate-unverifiable
- red CI blocks naming the failing check
- concurrent local gates are bounded and queue
- the served next action names the missing evidence
