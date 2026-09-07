---
id: q00024
title: "Atomic reconcile — staging + promote + reconciliation_runs"
kind: plan
status: ready
type: proposal
track: architecture
date: 2026-09-07
priority: P1
audit-source:
  file: docs/delendai/audits/2026-09-07-develop-external-audit.md
  finding: AUD-RECONCILE-ATOMIC-010
  snapshot: 91bbbff76ce35452c8c8b6e3bf2129a490bf7c94
related:
  - q00022
  - q00023
  - f00514
---

# q00024 — Atomic reconcile (staging + promote)

## Goal

Distinguish two modes of reconciliation:

1. **`mode: 'incremental'`** — direct write into the active DB inside a
   single IMMEDIATE transaction (used for small updates and the normal
   `sync_proposals` cadence).
2. **`mode: 'shadow'`** — full rebuild into a separate DB file
   (`*.staging.sqlite`); if the staging build ends with valid
   `integrity_check`, `foreign_key_check`, domain invariants, and a
   matching `logical_digest`, the staging DB is **promoted** to active
   by an atomic rename. If anything fails, the active DB stays exactly
   as it was.

The audit marks this P1 because the worst kind of corruption is a
"rebuild that itself corrupts the DB", and the staging/promote pattern
is the canonical defence.

## Why

> Reconciliación atómica. No actualizaría directamente la DB activa
> durante un rebuild importante. Modelo:
> ACTIVE DB → Git SHA → STAGING → (parse, reconcile, validate,
> foreign_key_check, integrity_check, domain invariants, digest) →
> promote. Si staging falla: ACTIVE permanece intacta.

The proposals plugin today has only `incremental` semantics (best
effort; can leave the DB partially updated on a crash mid-run). A full
rebuild has no staging mode at all. This means the user's "rm sqlite
&& reconcile && expect same digest" test (which the audit calls
obligatory) is risky to run: if it fails partway, the user has lost
their operational state with no easy recovery.

## Why this design

**Two separate files.** Active DB is `.delendai/state/proposals.sqlite`.
Staging DB is `.delendai/state/proposals.sqlite.staging`. They are never
both opened at once; the staging build holds an exclusive lock on the
staging file.

**Atomic promote.** The promote step is a `fs.renameSync` from staging
to active — guaranteed atomic on POSIX filesystems, and on Windows
ReplaceFile-equivalent semantics. The DB connection on the active file
is closed before rename and reopened after.

**Promotion guard.** Promote runs only when:
1. `PRAGMA integrity_check` returns `ok`.
2. `PRAGMA foreign_key_check` returns zero rows.
3. The domain invariants (proposed by `f00518`'s `db doctor`) pass.
4. The staging `logical_digest` matches the expected digest (when the
   expected digest is provided).

If any of the four fail, promote is refused, the staging DB is moved
aside (`.staging.failed-<timestamp>.sqlite`), and the active DB stays
untouched. The failure is recorded as a `reconciliation_runs` row with
`status = 'degraded'`.

## non-goals

- Do NOT change the default sync semantics — `proposals_sync_proposals`
  stays incremental.
- Do NOT introduce WAL tuning — `q00022 S1` already sets the baseline.
- Do NOT add cross-DB migrations; promotion is a binary rename.

## Slices

- global_gate: lint

### S1 — `mode: 'shadow'` writes to a separate file; full pipeline runs against staging

- **Status**: pending
- **Files**:
  - `packages/proposals-sqlite/src/lib/reconciler/staging.ts` (new —
    opens the staging DB, runs the full pipeline, returns the
    staging digest)
  - `packages/proposals-sqlite/src/lib/reconciler/reconcile.ts`
    (modified — dispatches to `incremental` or `shadow`)
  - `packages/proposals-sqlite/tests/src/lib/reconciler/staging.spec.ts`
    (new)
- **Gate**: type
- acceptance:
  - `reconcile({ mode: 'shadow', sha: '<sha>' })` opens a fresh
    staging DB at `.delendai/state/proposals.sqlite.staging`,
    runs parse + reconcile + integrity_check + foreign_key_check,
    and returns `{ stagingDigest, integrity, foreignKey,
    status: 'ok' | 'degraded' }`.
  - The active DB is NEVER opened during a shadow run.
  - If any check fails, the staging file is moved to
    `.delendai/state/proposals.sqlite.staging.failed-<iso>.sqlite`
    (never deleted; the failure is preserved for forensic analysis).
  - The active DB's file mtime is unchanged.

### S2 — `promoteStaging()` atomically swaps staging into active

- **Status**: pending
- **Files**:
  - `packages/proposals-sqlite/src/lib/reconciler/promote.ts` (new)
  - `packages/proposals-sqlite/src/lib/reconciler/reconcile.ts`
    (modified — exposes `promote` as a separate verb)
  - `packages/proposals-sqlite/tests/src/lib/reconciler/promote.spec.ts`
    (new)
- **Gate**: type
- acceptance:
  - `promoteStaging()`:
    1. Checks `integrity_check`, `foreign_key_check`, domain
       invariants, digest match.
    2. Closes the active DB connection (if any).
    3. Calls `fs.renameSync` on the staging file.
    4. Reopens the active DB at the new path.
    5. Records the run in `reconciliation_runs` with
       `status = 'ok'` and `logical_digest = <staging digest>`.
  - If ANY guard fails, promote is refused, no rename happens, and the
    active DB is untouched.
  - The promote test simulates a corrupt staging DB and verifies
    the active DB is byte-identical pre and post attempt.

### S3 — `reconciliation_runs` is the audit trail: every reconcile + every promote is logged

- **Status**: pending
- **Files**:
  - `packages/proposals-sqlite/src/lib/reconciler/runs.ts` (new)
  - `packages/proposals-sqlite/tests/src/lib/reconciler/runs.spec.ts`
    (new)
- **Gate**: type
- acceptance:
  - Every reconcile run (incremental or shadow) writes exactly one
    `reconciliation_runs` row with all the counters
    (`files_seen`, `files_changed`, `entities_created`,
    `entities_updated`, `entities_deleted`, `entities_quarantined`),
    `started_at`, `completed_at`, `status`, `source_commit`,
    `logical_digest`.
  - Every promote run writes an additional
    `reconciliation_runs` row with `kind = 'promote'`.
  - The audit story becomes:
    `SELECT * FROM reconciliation_runs WHERE source_commit = '<sha>';`
    returns a complete picture.

## acceptance

- All S1-S3 slices land.
- `delendai reconcile --sha <sha> --mode shadow` followed by
  `delendai reconcile promote` either succeeds atomically or leaves
  the active DB exactly as it was.
- `reconciliation_runs` is the single source of truth for "what did the
  last reconcile do?".

## notes

- Staging DB files are intentionally NOT auto-deleted; failed runs
  remain on disk until a future `db doctor` (f00518) explicitly
  prunes them after N days.
- Promotion is a binary operation; the active DB NEVER is in a
  half-updated state.