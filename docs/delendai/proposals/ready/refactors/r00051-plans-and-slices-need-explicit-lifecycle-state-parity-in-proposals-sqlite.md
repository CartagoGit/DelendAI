---
id: r00051
title: "plans and slices need explicit lifecycle state parity in proposals-sqlite"
kind: refactor
status: ready
type: proposal
track: architecture
date: 2026-09-07
---

# r00051 — plans and slices need explicit lifecycle state parity in proposals-sqlite

## Goal

Add explicit lifecycle state columns and invariants for plans and slices in proposals-sqlite so close and transition semantics can be implemented with the same robustness as proposals.

## why

The current proposals-sqlite schema gives proposals explicit status and revision semantics, but plans and slices still rely mainly on closed_at and lifecycle side tables. That blocks an honest completion of q00022 S3 and weakens r00047/r00048, because close_plan and close_slice cannot use the same storage-level lifecycle contract as proposals yet.

## non-goals

- Do NOT wire the plugin read/write paths in this proposal; q00022 S4 still owns plugin integration.
- Do NOT replace lifecycle_events or outbox semantics; this proposal only brings plan/slice rows up to lifecycle parity.
- Do NOT broaden this into a whole-schema rewrite; use forward migrations only.

## Slices

- global_gate: type

### S1 — Schema parity for plans and slices
- **Status**: pending
- **Files**: `packages/proposals-sqlite/src/lib/migrations.ts`, `packages/proposals-sqlite/src/lib/migrations/0008_plan_slice_lifecycle_parity.sql`, `packages/proposals-sqlite/src/lib/schema.ts`, `packages/proposals-sqlite/src/lib/sqlite-driver.spec.ts`
- **Gate**: type
- acceptance:
  - "Plans and slices gain explicit status columns with constrained enums and lifecycle-compatible invariants."
  - "The migration is forward-only and preserves existing rows."
  - "The focused schema tests prove plans/slices can no longer rely only on closed_at to express lifecycle state."
- review-state: in_review
- review-implementer: github-copilot
### S2 — Repository semantics for plan and slice lifecycle
- **Status**: pending
- **Files**: `packages/proposals-sqlite/src/lib/repository/plans-repo.ts`, `packages/proposals-sqlite/src/lib/repository/slices-repo.ts`, `packages/proposals-sqlite/tests/src/lib/repository/plans-repo.spec.ts`, `packages/proposals-sqlite/tests/src/lib/repository/slices-repo.spec.ts`
- **Gate**: type
- acceptance:
  - "PlanRepo and SliceRepo expose transition/close semantics parallel to ProposalRepo."
  - "Lifecycle events and outbox rows are written from the same transaction on close paths."
  - "Conflict and invalid-transition outcomes are explicit, not silent."
- review-state: in_review
- review-implementer: github-copilot
### S3 — Consume parity in close_plan and close_slice paths
- **Status**: pending
- **Files**: `packages/proposals-sqlite/src/index.ts`, `plugins/proposals/package.json`, `plugins/proposals/src/index.ts`, `plugins/proposals/src/lib/tools/close-plan.tool.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/tests/src/lib/tools/close-plan.tool.spec.ts`, `plugins/proposals/tests/src/lib/tools/close-slice-validation.spec.ts`
- **Gate**: type
- acceptance:
  - "close_plan and close_slice can consume explicit plan/slice status from SQL-backed repos."
  - "Legacy filesystem semantics are not relied on as the only lifecycle signal."
  - "Focused plugin tests cover the new parity path."
- review-state: in_review
- review-implementer: github-copilot
## acceptance

- Plans and slices gain explicit status columns with constrained enums and lifecycle-compatible invariants.
- The migration is forward-only and preserves existing rows.
- The focused schema tests prove plans/slices can no longer rely only on closed_at to express lifecycle state.
- PlanRepo and SliceRepo expose transition/close semantics parallel to ProposalRepo.
- Lifecycle events and outbox rows are written from the same transaction on close paths.
- Conflict and invalid-transition outcomes are explicit, not silent.
- close_plan and close_slice can consume explicit plan/slice status from SQL-backed repos.
- Legacy filesystem semantics are not relied on as the only lifecycle signal.
- Focused plugin tests cover the new parity path.
