---
id: x00945
title: "A workspace migration and its rollback touch exactly what they backed up, atomically"
kind: fix
status: done
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 3cdb89c3-401b-48be-9fb9-9af9f77b9e03
last-correlation-id: 3cdb89c3-401b-48be-9fb9-9af9f77b9e03
last-transition-from: review
last-transition-at: 2026-10-24T18:22:59.638Z
shipped-in:
  - "4a66b6ecf42fbb140c3f11e86a1871d45bf3e047"
---

# x00945 — A workspace migration and its rollback touch exactly what they backed up, atomically

## goal

The migration transaction writes every file atomically, rollback restores exactly the scope the backup holds and never deletes .git, a failed attempt leaves its manifest next to its backup, and migrate status, --dry-run and run walk the same path as the start-up guard.

## why

Joint audit a00095. D7: the core migration transaction writes non-atomically; a kill corrupts user configs. G38: rollback has its own atomic write, separate from the one the rest uses. gpt-6.1-sol ORCH-01 (P1): rollback deletes the .git directory the backup excludes, reproduced through the public CLI. G93: rollback restores with a scope different from the backup's and deletes .git and the manifests themselves. D32: a failure with rollback persists the backup but no manifest of the attempt. D31: migrate status, --dry-run and run do not cover the same route as the start-up guard.

## non-goals

- What the migrations rewrite (the migrate-converges proposal).
- New migrations.

## slices

- global_gate: type

### S1 — Atomic writes and a backup-scoped rollback
- **Status**: done
- **Files**: `packages/core/src/lib/workspace-migration/transaction/migration-transaction.ts`, `packages/core/src/lib/workspace-migration/transaction/rollback.ts`, `packages/core/src/lib/workspace-migration/transaction/migration-manifest.ts`
- **Gate**: type
- acceptance:
  - "Every file the transaction writes goes through the shared writeFileAtomic; rollback uses the same primitive (D7, G38)."
  - "Rollback removes and restores only paths listed in the backup manifest; a spec with a .git directory and files outside the backup keeps them byte-identical (ORCH-01, G93)."
  - "A failed apply that rolls back persists the attempt's manifest beside its backup, with the failing step named (D32)."
- shipped-in: `77a817d96b90`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: claude-sonnet-5-5
- review-log: approved by claude-sonnet-5-5 — verified at 4a66b6ecf42f, validate exit 0 and tests 9/9 claimed, no recorded run cited; acceptance 3/3: (1) rollback.ts (lines 121, 204) and migration-manifest.ts (134) write via writeFileAtomic; migration-transaction.ts has no direct file writes (2) migration-transaction.spec 'leaves what the backup did not take alone, and keeps the failed attempt on record' passes (3) same spec keeps the failed attempt on record; manifest persisted by writeFileAtomic; named step per spec — verified by code reading and spec runs

### S2 — One route for status, dry-run, run and the start-up guard
- **Status**: done
- **Files**: `packages/cli/src/commands/migrate.command.ts`, `packages/core/src/lib/workspace-migration/legacy-migration.service.ts`, `packages/core/src/lib/workspace-migration/cache-layout-step.service.ts`, `packages/core/src/lib/contracts/interfaces/workspace-migration.interface.ts`, `packages/core/src/cli.ts`
- **Gate**: type
- acceptance:
  - "migrate --dry-run lists exactly the steps migrate run would apply and the start-up guard would require; status reports the same pending set (D31)."
  - "A spec runs the four entry points on one fixture and compares their step lists."
- shipped-in: `4698cdac1ab9`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: claude-sonnet-5-5
- review-log: approved by claude-sonnet-5-5 — verified at 4a66b6ecf42f, validate exit 0 and tests 9/9 claimed, no recorded run cited; acceptance 2/2: (1) migration-preview.service.spec + migrate-route.spec 'list, report, do and apply the same steps' pass (2) migrate-route.spec runs the four entry points on one fixture and compares step lists — verified by code reading and spec runs

## acceptance

- Every file the transaction writes goes through the shared writeFileAtomic; rollback uses the same primitive (D7, G38).
- Rollback removes and restores only paths listed in the backup manifest; a spec with a .git directory and files outside the backup keeps them byte-identical (ORCH-01, G93).
- A failed apply that rolls back persists the attempt's manifest beside its backup, with the failing step named (D32).
- migrate --dry-run lists exactly the steps migrate run would apply and the start-up guard would require; status reports the same pending set (D31).
- A spec runs the four entry points on one fixture and compares their step lists.
