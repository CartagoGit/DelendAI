---
id: x00945
title: "A workspace migration and its rollback touch exactly what they backed up, atomically"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
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
- **Status**: pending
- **Files**: `packages/core/src/lib/workspace-migration/transaction/migration-transaction.ts`, `packages/core/src/lib/workspace-migration/transaction/rollback.ts`, `packages/core/src/lib/workspace-migration/transaction/migration-manifest.ts`
- **Gate**: type
- acceptance:
  - "Every file the transaction writes goes through the shared writeFileAtomic; rollback uses the same primitive (D7, G38)."
  - "Rollback removes and restores only paths listed in the backup manifest; a spec with a .git directory and files outside the backup keeps them byte-identical (ORCH-01, G93)."
  - "A failed apply that rolls back persists the attempt's manifest beside its backup, with the failing step named (D32)."

### S2 — One route for status, dry-run, run and the start-up guard
- **Status**: pending
- **Files**: `packages/cli/src/commands/migrate.command.ts`, `packages/core/src/lib/workspace-migration/migration-registry.ts`, `packages/core/src/lib/workspace-migration/migration-report.service.ts`
- **Gate**: type
- acceptance:
  - "migrate --dry-run lists exactly the steps migrate run would apply and the start-up guard would require; status reports the same pending set (D31)."
  - "A spec runs the four entry points on one fixture and compares their step lists."

## acceptance

- Every file the transaction writes goes through the shared writeFileAtomic; rollback uses the same primitive (D7, G38).
- Rollback removes and restores only paths listed in the backup manifest; a spec with a .git directory and files outside the backup keeps them byte-identical (ORCH-01, G93).
- A failed apply that rolls back persists the attempt's manifest beside its backup, with the failing step named (D32).
- migrate --dry-run lists exactly the steps migrate run would apply and the start-up guard would require; status reports the same pending set (D31).
- A spec runs the four entry points on one fixture and compares their step lists.
