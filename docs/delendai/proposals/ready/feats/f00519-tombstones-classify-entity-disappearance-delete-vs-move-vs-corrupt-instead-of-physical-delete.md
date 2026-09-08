---
id: f00519
title: "Tombstones — classify entity disappearance (delete vs move vs corrupt) instead of physical delete"
kind: feat
status: ready
type: proposal
track: architecture
date: 2026-09-07
priority: P1
audit-source:
  file: docs/delendai/audits/2026-09-07-develop-external-audit.md
  finding: AUD-TOMBSTONE-038
  snapshot: 91bbbff76ce35452c8c8b6e3bf2129a490bf7c94
related:
  - q00022
  - f00515
---

# f00519 — Tombstones

## Goal

Make "an entity went away from the filesystem" a first-class
classification problem instead of an immediately-applied hard delete.
When a proposal, plan, or slice disappears from Git, the reconciler
records a tombstone row instead of deleting the entity. Tombstones are
the counterpart to `f00515`'s quarantine: together they cover every
"this entity is no longer where it was" case.

## Why

> Tombstones. Esto es bastante importante y fácil de olvidar. Si una
> propuesta desaparece de Git: ¿Qué significa?
> A) se eliminó, B) se movió, C) está corrupta, D) checkout parcial,
> E) reconciliación incompleta. No asumiría inmediatamente A. Usaría
> `tombstone/deleted_at` y reconciliación por identidad/hash. Nunca
> borrado físico inmediato.

The user-reported "propuesta que no es capaz de cerrar" is sometimes
not a close failure at all — it's a move that the read path didn't
notice. Tombstones keep the entity alive (and recoverable) until the
operator explicitly decides what to do.

## Why this design

**Tombstone columns on every entity table.** `proposals`,
`plans`, `slices` gain:
- `deleted_at INTEGER` (NULL = alive; non-null = tombstoned).
- `last_seen_at INTEGER NOT NULL` (the most recent reconcile that
  saw this entity in Git).
- `last_seen_commit TEXT NOT NULL` (the SHA where we last saw it).
- `tombstone_reason TEXT` (one of `git-removed`, `renamed`,
  `moved-by-reorg`, `unknown`).

A row is tombstoned on reconcile when its `source_path` does not
appear in the current SHA's tree and its `blob_sha` is not present in
the diff.

**No physical delete.** The reconciler never issues a
`DELETE FROM proposals`; rows live forever in the table. `deleted_at`
is the discriminator.

**Reconciliation by identity, not by path.** A proposal whose
markdown moved from `ready/fixes/x00510.md` to
`ready/refactors/x00510.md` keeps its `uid = x00510`; the reconciler
updates `source_path` (the new path) and never produces a
duplicate. The `path_history` table records the renames.

**Lifecycle events on tombstones.** Every tombstone emits a
`lifecycle_events` row of kind `entity_tombstoned` with the reason
and the source commit. This is the audit trail for "why did this
proposal disappear".

## non-goals

- Do NOT add automatic resurrection. A tombstoned entity is brought
  back only by an explicit `db doctor` action or by a future
  reconcile that sees the entity again (with the same `blob_sha` or
  a path that matches the `path_history` table).
- Do NOT change the user-facing lifecycle states — tombstoned is
  orthogonal (an entity can be `done` AND tombstoned; the
  combination means "closed, file removed").
- Do NOT add a UI for tombstones in this proposal; only the
  storage surface and the diagnostic tools.

## Slices

- global_gate: lint

### S1 — Tombstone columns + path_history table + reconciler classification

- **Status**: done
- **Files**:
  - `packages/proposals-sqlite/src/lib/schema.ts`
  - `packages/proposals-sqlite/src/lib/migrations.ts`
  - `packages/proposals-sqlite/src/lib/migrations/0014_tombstones.sql`
  - `packages/proposals-sqlite/src/lib/reconciler-tombstone.ts`
  - `packages/proposals-sqlite/src/lib/reconciler.ts`
  - `packages/proposals-sqlite/src/lib/reconciler-staging.ts`
  - `packages/proposals-sqlite/tests/src/lib/reconciler-tombstone.spec.ts`
    (new)
- **Gate**: type
- acceptance:
  - `classifyDisappearance` returns one of `git-removed`,
    `renamed`, `moved-by-reorg`, `unknown`. The classifier is
    pure (no I/O) and tested against a fixture set.
  - When an entity's `source_path` is no longer in the tree but a
    path with the same basename exists at a different location,
    the classifier returns `renamed` and updates `source_path`.
  - When an entity is wholly absent, the classifier returns
    `git-removed` and sets `deleted_at`.
  - `path_history` records every rename.
  - `bun run typecheck` green.
- review-state: done
- review-implementer: delendai-impl-20260908
- review-reviewer: proposal_guardian
- review-log: approved by proposal_guardian — Approve sobre 18817f77d. Criterios cubiertos literalmente: `classifyDisappearance` returns one of `git-removed`,; When an entity's `source_path` is no longer in the tree but a; When an entity is wholly absent, the classifier returns; `path_history` records every rename.; `bun run typecheck` green. Verificación independiente: bun test packages/proposals-sqlite/tests/src/lib/reconciler-tombstone.spec.ts verde 6/6, 11 expect(); 18817f77d contiene los archivos entregados del slice; el wrapper literal bun run typecheck quedó esperando por compute lock externo, pero el script subyacente bun tools/scripts/typecheck.script.ts tipa limpio en el árbol actual.
### S2 — `proposals_db_tombstones` + `proposals_db_resurrect`

- **Status**: done
- **Files**:
  - `plugins/proposals/src/lib/tools/tombstones.tool.ts`
  - `plugins/proposals/src/lib/tools/resurrect.tool.ts`
  - `plugins/proposals/src/lib/services/resurrect.ts`
  - `plugins/proposals/tests/src/lib/tools/tombstones.tool.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/resurrect.tool.spec.ts`
- **Gate**: type
- acceptance:
  - `proposals_db_tombstones` returns the list with `{ uid, kind,
    deleted_at, last_seen_at, last_seen_commit, reason,
    path_history }` and is read-only.
  - `proposals_db_resurrect({ uid, note })` clears `deleted_at`,
    appends a `lifecycle_events` row with `kind:
    'entity_resurrected'` and the note.
  - Resurrecting an entity that was renamed (not removed) updates
    `source_path` to the current location and clears the tombstone.
  - Both tools are explicit; no auto-resurrection ever runs.
- review-state: done
- review-implementer: delendai-impl-20260908
- review-reviewer: technical_investigator
- review-log: requested_changes by delivery_verifier — El listado usa camelCase en vez del contrato snake_case y path_history siempre está vacío. Corregir schema/output y ampliar el test para afirmar las claves y contenido requeridos.
- review-log: approved by technical_investigator — Aprobado. Verificación independiente del commit 4fd5272f4 y del estado actual: contrato snake_case exacto, listado readonly, resurrección explícita auditada por UID, aislamiento de otros UIDs y frontera rename/reconciler confirmados. Los cambios locales restantes son concurrentes y ajenos; la validación scoped del slice está verde.
### S3 — Tombstone regression suite: a renamed entity preserves its `uid`

- **Status**: done
- **Files**:
  - `packages/proposals-sqlite/tests/e2e/tombstone.spec.ts` (new)
- **Gate**: e2e
- acceptance:
  - The e2e test inserts a proposal at `ready/fixes/x00510-*.md`,
    then re-runs reconcile with a tree that moves it to
    `ready/refactors/x00510-*.md`. After the reconcile, the
    proposal still exists with the same `uid`; `source_path` is
    updated; `path_history` records the move.
  - A second test renames an entity, then "deletes" it (file
    absent on the next SHA). The entity is tombstoned with
    `reason = 'git-removed'`, NOT physically deleted.
  - A third test verifies that `proposals_db_resurrect` on a
    tombstoned entity produces a regular lifecycle event without
    resurrecting any other state.
- review-state: done
- review-implementer: delendai-impl-20260908
- review-reviewer: proposal_guardian
- review-log: approved by proposal_guardian — Approve independiente sobre c494ae616. Criterios cubiertos literalmente: The e2e test inserts a proposal at `ready/fixes/x00510-*.md`,; A second test renames an entity, then "deletes" it (file; A third test verifies that `proposals_db_resurrect` on a. Evidencia observada: bun test packages/proposals-sqlite/tests/e2e/tombstone.spec.ts = 3 pass, 0 fail, 8 expect() calls; bun run typecheck verde; Biome verde en packages/proposals-sqlite/tests/e2e/tombstone.spec.ts.
## acceptance

- All S1-S3 slices land.
- The audit invariant on "no entity silently disappears" is
  demonstrably satisfied for both `quarantine` (corrupt content)
  and `tombstone` (absent content).
- The reconciler is identity-based: rename, move, and reorganise
  preserve `uid`.

## notes

- Tombstones are append-only at the storage level (the row is
  never deleted); only the `deleted_at` flag is set / cleared.
- The `path_history` table is unbounded; a future `db doctor` may
  prune entries older than N days.