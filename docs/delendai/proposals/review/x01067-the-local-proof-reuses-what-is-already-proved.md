---
id: x01067
title: "The local proof reuses what is already proved"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-13
last-transition-id: 79f153c7-95a9-4b74-9aeb-c19a7722ad4a
last-correlation-id: 79f153c7-95a9-4b74-9aeb-c19a7722ad4a
last-transition-from: in-progress
last-transition-at: 2026-11-17T22:13:24.429Z
---

# x01067 — The local proof reuses what is already proved

## goal

A local proof tests and lints only what changed since the nearest already-proved ancestor, skips steps whose declared inputs are byte-identical to a step that passed on this machine, and runs the bun-owned suite only for the specs near the change.

## why

Measured from prove-timings: a proof takes 10-18 minutes a round and units need several. A unit that merged sibling slices diffs against merge-base(develop, HEAD), so every spec the already-proved slices touched is selected again (6-11 min); test:sqlite runs in full on any path match (about 2.5 min); lint-docs, lint-security, quality-gate and the land rehearsal re-run unchanged between rounds (3-5 min).

## non-goals

- Skipping anything that is not provably unchanged by content hash.
- Changing the forge's plan or what CI runs; CI has no store and reuses nothing.
- Narrowing whole-repo steps: generated files current, tool budgets and typecheck.

## slices

- global_gate: type

### S1 — Proved ancestors narrow the diff
- **Status**: review
- **Files**: `tools/scripts/ci/proved-ancestors.ts`, `tools/scripts/ci/proved-ancestors.store.ts`, `tools/scripts/ci/proved-ancestors.spec.ts`, `tools/scripts/ci/proved-ancestors.e2e.spec.ts`, `tools/scripts/ci/prove-plan.script.ts`
- **Gate**: type
- acceptance:
  - "A passing proof records commit, tree, base, scope and time in a store under the git common dir shared by every worktree; entries whose commit no longer exists are ignored and pruned."
  - "The base for selection is the candidate with the fewest changed files against HEAD among merge-base(develop, HEAD) and the 20 most recent proved commits that are ancestors of HEAD, and the proof prints which it used and why."
  - "Generated-files, tool budgets and typecheck steps keep the merge-base; the choice is a pure function with specs over an in-memory git reader."
- shipped-in: `afb39fe2c54a`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S2 — Per-step result reuse
- **Status**: review
- **DependsOn**: [S1]
- **Files**: `tools/scripts/ci/step-reuse.ts`, `tools/scripts/ci/step-reuse.spec.ts`, `tools/scripts/ci/step-inputs.constant.ts`, `tools/scripts/ci/prove-plan.script.ts`
- **Gate**: type
- acceptance:
  - "A step that declares inputs is keyed by sha256 of its label, command and the git index entries of its inputs at HEAD, and is skipped with a 'reused' line when that key passed before on this machine and the inputs are clean in the working tree."
  - "Failures are never cached; steps without declared inputs always run; --no-reuse and an environment variable force everything; reuse is keyed on the presence of the store, never on CI."
  - "lint-docs, lint-security, quality-gate, land rehearsal and lint-governance declare the paths their scripts read."
- shipped-in: `afb39fe2c54a`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

### S3 — test:sqlite near the change
- **Status**: review
- **DependsOn**: [S2]
- **Files**: `tools/scripts/ci/bun-near-specs.ts`, `tools/scripts/ci/bun-near-specs.spec.ts`, `tools/scripts/ci/prove-plan.script.ts`, `tools/scripts/ci/prove-plan.script.spec.ts`
- **Gate**: type
- acceptance:
  - "Only the bun-owned specs the near-spec selection names run under bun test; none run when no bun-owned spec is near the change."
  - "The full bun-owned suite runs only when the bun runner's own config or setup changed."
  - "The vitest step no longer receives the bun-owned specs."
- shipped-in: `8e63cec7f2e6`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- A passing proof records commit, tree, base, scope and time in a store under the git common dir shared by every worktree; entries whose commit no longer exists are ignored and pruned.
- The base for selection is the candidate with the fewest changed files against HEAD among merge-base(develop, HEAD) and the 20 most recent proved commits that are ancestors of HEAD, and the proof prints which it used and why.
- Generated-files, tool budgets and typecheck steps keep the merge-base; the choice is a pure function with specs over an in-memory git reader.
- A step that declares inputs is keyed by sha256 of its label, command and the git index entries of its inputs at HEAD, and is skipped with a 'reused' line when that key passed before on this machine and the inputs are clean in the working tree.
- Failures are never cached; steps without declared inputs always run; --no-reuse and an environment variable force everything; reuse is keyed on the presence of the store, never on CI.
- lint-docs, lint-security, quality-gate, land rehearsal and lint-governance declare the paths their scripts read.
- Only the bun-owned specs the near-spec selection names run under bun test; none run when no bun-owned spec is near the change.
- The full bun-owned suite runs only when the bun runner's own config or setup changed.
- The vitest step no longer receives the bun-owned specs.
