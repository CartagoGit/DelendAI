---
id: r00050
title: "mutation_commands idempotency store separate from lifecycle_events"
kind: refactor
status: ready
type: proposal
track: architecture
date: 2026-09-07
priority: P0
related:
  - q00022
  - r00047
  - f00514
  - f00518
---

# r00050 — mutation_commands idempotency store separate from lifecycle_events

## Goal

Introduce a first-class `mutation_commands` store so lifecycle command
retries, deduplication, and response replay live outside
`lifecycle_events`, while `lifecycle_events` remains an immutable facts
ledger.

## why

The active SQLite migration set models idempotent lifecycle verbs, but
the duplicate-command path is still routed conceptually through
`lifecycle_events`. That couples command receipts to lifecycle facts,
makes same-key same-payload replay ambiguous, and risks polluting the
audit trail with retry attempts.

## non-goals

- Do NOT redefine the lifecycle state machine; `r00047` still owns the
  public close outcomes.
- Do NOT replace the outbox processor; `f00514` still owns external
  side-effects and delivery semantics.
- Do NOT broaden this into full event sourcing; entity rows remain the
  operational truth.

## Slices

- global_gate: type

### S1 — Schema + repository for `mutation_commands`
- **Status**: done
- **Files**: `packages/proposals-sqlite/src/lib/schema.ts`, `packages/proposals-sqlite/src/lib/sqlite-driver.spec.ts`, `packages/proposals-sqlite/src/lib/migrations/0006_mutation_commands.sql`, `packages/proposals-sqlite/src/lib/repository/mutation-commands-repo.ts`, `packages/proposals-sqlite/tests/src/lib/repository/mutation-commands-repo.spec.ts`
- **Gate**: type
- review-state: done
- review-implementer: github-copilot
- review-reviewer: github-copilot-review-20260911
- review-log: approved by github-copilot-review-20260911 — Revisión independiente sobre develop c29fffc74; repository/schema introducidos en 2c02d9c27 y claim atómico corregido en 2ed7a4c3a.
### S2 — Integrate lifecycle writes with command receipts
- **Status**: pending
- **Files**: `packages/proposals-sqlite/src/lib/repository/proposals-repo.ts`, `packages/proposals-sqlite/src/lib/repository/plans-repo.ts`, `packages/proposals-sqlite/src/lib/repository/slices-repo.ts`, `plugins/proposals/src/lib/services/close-plan.service.ts`, `plugins/proposals/src/lib/services/close-slice.service.ts`, `plugins/proposals/src/lib/services/close-proposal.service.ts`
- **Gate**: type
- review-state: in_review
- review-implementer: github-copilot-20260911
### S3 — Recovery suite + doctor checks for orphaned or inconsistent receipts
- **Status**: pending
- **Files**: `packages/proposals-sqlite/tests/e2e/mutation-commands-idempotency.spec.ts`, `plugins/proposals/src/lib/services/db-doctor/checks/command-receipts.ts`, `plugins/proposals/tests/src/lib/services/db-doctor.spec.ts`
- **Gate**: type

## acceptance

- Same key plus same fingerprint replays the previously persisted
  outcome without creating a new lifecycle event.
- Same key plus different fingerprint is rejected explicitly as an
  idempotency conflict.
- `db doctor` can list orphaned or inconsistent command receipts without
  mutating the DB.

## notes

- This proposal is the missing storage primitive that lets `r00047`
  keep lifecycle semantics clean while `f00514` keeps side-effects
  separated.