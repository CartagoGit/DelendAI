---
id: q00024
title: "Atomic reconcile — shadow validate + transactional apply + reconciliation_runs"
kind: plan
status: done
type: proposal
track: architecture
date: 2026-09-07
shipped-in:
  - bd2d093c7
  - 6bf2c289c
  - 432385a3f
  - c1547ce4538fd00dc68be09263c4e37e021b41df
priority: P1
audit-source:
  file: docs/delendai/audits/2026-09-07-develop-external-audit.md
  finding: AUD-RECONCILE-ATOMIC-010
  snapshot: 91bbbff76ce35452c8c8b6e3bf2129a490bf7c94
related:
  - q00022
  - q00023
  - f00514
last-transition-id: 19f51e5a-133b-4ae7-880e-85148d6fdcc2
last-correlation-id: 19f51e5a-133b-4ae7-880e-85148d6fdcc2
last-transition-from: review
---

# q00024 — Atomic reconcile (shadow validate + transactional apply)

## Goal

Distinguish two modes of reconciliation:

1. **`mode: 'incremental'`** — direct write into the active DB inside a
   single IMMEDIATE transaction (used for small updates and the normal
   `sync_proposals` cadence).
2. **`mode: 'shadow'`** — full rebuild into a separate DB file
   (`*.staging.sqlite`); if the staging build ends with valid
   `integrity_check`, `foreign_key_check`, domain invariants, and a
  matching `logical_digest`, the candidate projection is applied to the
  active DB in ONE IMMEDIATE transaction. If anything fails, the active
  DB stays exactly as it was.

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

**Transactional apply, not file swap.** Shadow exists to validate a
candidate projection, compute its digest, and produce a diff. The
active DB keeps its operational ledgers (`lifecycle_events`, `outbox`,
`mutation_commands`, reconciliation history); a validated candidate is
applied into that DB inside one IMMEDIATE transaction.

**Apply guard.** Transactional apply runs only when:
1. `PRAGMA integrity_check` returns `ok`.
2. `PRAGMA foreign_key_check` returns zero rows.
3. The domain invariants (proposed by `f00518`'s `db doctor`) pass.
4. The staging `logical_digest` matches the expected digest (when the
   expected digest is provided).

If any of the four fail, apply is refused, the staging DB is moved
aside (`.staging.failed-<timestamp>.sqlite`), and the active DB stays
untouched. The failure is recorded as a `reconciliation_runs` row with
`status = 'degraded'`.

## non-goals

- Do NOT change the default sync semantics — `proposals_sync_proposals`
  stays incremental.
- Do NOT introduce WAL tuning — `q00022 S1` already sets the baseline.
- Do NOT replace the operational DB file via rename; apply is logical and transactional.

## Slices

- global_gate: lint

### S1 — `mode: 'shadow'` writes to a separate file; full pipeline runs against staging

- **Status**: done
- **Files**:
  - `packages/proposals-sqlite/src/lib/reconciler.ts` (modified — adds
    the `mode: 'shadow'` staging orchestration over the current
    parser/identity/candidate foundation)
  - `packages/proposals-sqlite/src/lib/reconciler-staging.ts` (new —
    opens the staging DB, runs the full pipeline, returns the staging
    digest)
  - `packages/proposals-sqlite/tests/src/lib/reconciler-staging.spec.ts`
    (new)
- **Gate**: type
- review-state: done
- review-implementer: github-copilot
- review-reviewer: delendai-delivery-verifier
- review-log: approved by delendai-delivery-verifier — Independent review passed: public reconcile dispatches shadow mode, staging remains isolated from active, integrity_check and foreign_key_check run, failed staging is preserved with reconciliation_runs evidence, and focused validation is green (6 tests, typecheck, Biome).
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

### S2 — `applyValidatedCandidate()` atomically applies the validated candidate into active

- **Status**: done
- **Files**:
  - `packages/proposals-sqlite/src/lib/reconciler-apply-candidate.ts`
    (new)
  - `packages/proposals-sqlite/src/lib/reconciler.ts` (modified —
    exposes `applyValidatedCandidate` as a separate verb)
  - `packages/proposals-sqlite/tests/src/lib/reconciler-apply-candidate.spec.ts`
    (new)
- **Gate**: type
- acceptance:
  - `applyValidatedCandidate()`:
    1. Checks `integrity_check`, `foreign_key_check`, domain
       invariants, digest match.
    2. Opens ONE IMMEDIATE transaction on the active DB.
    3. Applies only the Git-derived projection diff while preserving operational ledgers.
    4. COMMITS or ROLLBACKs as a unit.
    5. Records the run in `reconciliation_runs` with
       `status = 'ok'` and `logical_digest = <staging digest>`.
  - If ANY guard fails, apply is refused, no file swap happens, and the
    active DB is untouched.
  - The apply test simulates a corrupt staging DB and verifies the
    active DB is logically identical pre and post attempt, including
    lifecycle, outbox, and command history.

Changes requested on 2026-09-25 (the review note carried no reason) and
the slice rechecked against its acceptance the same day. Two items did
not hold:

- **Domain invariants were not checked.** The guard ran
  `PRAGMA integrity_check` on the staging database opened read-only, and
  on a read-only connection SQLite does not verify CHECK constraints —
  measured: a staging row with a status the CHECK forbids reported `ok`
  read-only and `CHECK constraint failed` otherwise. The CHECKs are the
  domain invariants (the status, kind and vocabulary a column accepts),
  so a corrupt candidate passed every guard and was stopped only by the
  active database refusing the row half-way through the copy: rejected
  with a raw SQLite message, and the failed candidate not kept. The
  integrity check now runs through a connection that is not read-only but
  refuses every write (`PRAGMA query_only`).
- **No test corrupted the staging database.** The "broken integrity"
  case marked the run `failed`. A new case corrupts the candidate for
  real (a CHECK-violating status), and asserts the apply is refused by the
  integrity guard and every row of every table of the active database —
  the lifecycle, outbox and command history included — is identical
  before and after.

A `degraded` candidate is recorded with status `degraded`, not `ok`: that
is x00539 S2's deliberate change (a quarantined README must not block a
promotion), kept.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: requested_changes by delendai-delivery-verifier — Revisado
- review-log: approved by glm-5.3-max — Independence: implementer claude-opus-5-5, reviewer glm-5.3-max. Worktree at develop tip 02c1be479. Read the whole diff of bd2d093c7 (277-line impl + 162-line spec) plus its post-review fixes (23ada0db5 query_only integrity so CHECK domain invariants are enforced; x00528 one-transaction all-tables apply; x00539 degraded-staging rules — degraded recorded as degraded, a deliberate x00539 change, kept). Gate measured: bun run test:sqlite (canonical bun-owned suite covering these specs) = 403 pass / 0 fail, 77 files, 2544 expect() calls — the q00024 S2 describe block passes all its cases; bun run typecheck exit 0 at this tip. Pre-existing develop-wide failures (lint:core-public-surface-budget 1081>1080, lint:commit-driver-guard 2 violations in plugins/commit-policy services, lint:cache stray plugins/commit-policy/.cache) reproduce identically in the shared checkout and touch none of this slice's files. Non-goals respected: sync semantics untouched, no WAL tuning, no active-DB rename. No out-of-scope changes in the delivery commit (2 files, both declared).
### S3 — `reconciliation_runs` is the audit trail: every reconcile + every transactional apply is logged

- **Status**: done
- **Files**:
  - `packages/proposals-sqlite/src/lib/reconciler-runs.ts` (new)
  - `packages/proposals-sqlite/tests/src/lib/reconciler-runs.spec.ts`
    (new)
- **Gate**: type
- acceptance:
  - Every reconcile run (incremental or shadow) writes exactly one
    `reconciliation_runs` row with all the counters
    (`files_seen`, `files_changed`, `entities_created`,
    `entities_updated`, `entities_deleted`, `entities_quarantined`),
    `started_at`, `completed_at`, `status`, `source_commit`,
    `logical_digest`.
  - Every apply run writes an additional
    `reconciliation_runs` row with `kind = 'apply_candidate'`.
  - The audit story becomes:
    `SELECT * FROM reconciliation_runs WHERE source_commit = '<sha>';`
    returns a complete picture.
Changes requested on 2026-09-25 and addressed the same day:

- The incremental pass wrote its run row before the entities (quarantine
  records point at it) as zero created, zero updated and a null digest,
  and never corrected it. It now records the entities it created and
  updated and the logical digest once they are known.
  `reconciler-runs.spec.ts` covers a create pass and an edit pass; with
  the correction disabled that case fails.
- The apply run is recorded with `kind = 'apply_candidate'`, as the
  acceptance says. The schema had called it `promote` since 0002, so
  migration 0022 rebuilds `reconciliation_runs` with the new vocabulary,
  renames the existing `promote` rows and keeps the table's indexes and
  AUTOINCREMENT counter (`apply-candidate-run-kind.spec.ts`); the writer
  and the one reader (`db-verify.ts`) use the new value.
- `6bf2c289c` also renamed `x00323` from `ready/` to `in-progress/`,
  unchanged, outside this slice. It was that proposal's own claim, swept
  into this commit; x00323 went through review to `done` on 2026-09-07/08
  and the rename has no remaining effect. A published commit cannot be
  split after the fact, so it is recorded here.
- Files: `packages/proposals-sqlite/src/lib/reconciler-incremental.service.ts`,
  `packages/proposals-sqlite/src/lib/migrations/0022_apply_candidate_run_kind.sql`,
  `packages/proposals-sqlite/src/lib/reconciler-apply-candidate.ts`,
  `packages/proposals-sqlite/src/lib/reconciler-runs.ts`,
  `plugins/proposals/src/lib/services/db-verify.ts`,
  `packages/proposals-sqlite/tests/src/lib/reconciler-runs.spec.ts`,
  `packages/proposals-sqlite/tests/src/lib/apply-candidate-run-kind.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: requested_changes by delendai-delivery-verifier — Revisados 6bf2c289c y 432385a3f. bun run typecheck pasa y las 3 pruebas Bun de reconciler-runs pasan. La aceptacion de S3 no se cumple: reconciler-incremental.service.ts inserta entities_created y entities_updated como 0 y logical_digest como NULL incluso cuando despues calcula propuestas creadas y actualizadas. Reproducir una reconciliacion incremental con un archivo nuevo y consultar reconciliation_runs por source_commit: la fila informa 0 creaciones y digest nulo. La aplicacion graba kind=promote en reconciler-apply-candidate.ts, mientras la propuesta exige apply_candidate. La prueba de S3 solo cubre los contadores del modo shadow y el commit 6bf2c289c mueve ademas una propuesta x00323 ajena al scope declarado. Para aprobar, registrar los contadores y digest correctos en incremental, resolver la discrepancia del kind sin modificar la propuesta para adaptarla al codigo, cubrir ambos flujos con pruebas y separar el cambio ajeno al scope.
- review-log: approved by glm-5.3-max — Independence: implementer claude-opus-5-5, reviewer glm-5.3-max. Worktree at develop tip 02c1be479. The queue's cited commit c1547ce45 is the merge that landed the work; the substantive S3 delivery is 1b1144844 ('every reconcile run records what it did (q00024 S3)') whose message explicitly answers the standing requested_changes from delendai-delivery-verifier 2026-09-25: incremental now records real counters + digest (was zeros/null), apply kind is now apply_candidate (was promote) via migration 0022 renames, and both flows have spec coverage (reconciler-runs.spec.ts grew from 3 to 4 cases incl. incremental counters; apply-candidate-run-kind.spec.ts added). The x00323 out-of-scope hunk flagged in that review was NOT carried into 1b1144844 (12 files, all in the declared S2/S3 scope + their migrations/checksums). Gate measured: bun run test:sqlite = 403 pass / 0 fail, 77 files, 2544 expectations — all q00024 S3 specs pass; bun run typecheck exit 0 at this tip. Pre-existing develop-wide failures (core-public-surface-budget 1081>1080, commit-driver-guard 2 violations, lint:cache stray dir) reproduce identically in the shared checkout and touch none of this slice's files. Non-goals respected.
## acceptance

- All S1-S3 slices land.
- `delendai reconcile --sha <sha> --mode shadow` followed by
  `delendai reconcile apply` either succeeds atomically or leaves
  the active DB exactly as it was.
- `reconciliation_runs` is the single source of truth for "what did the
  last reconcile do?".

**Reality (2026-09-15):** all three slices are done, but this proposal stays open on its second acceptance point. There is no `delendai reconcile --sha <sha> --mode shadow` or `delendai reconcile apply` command: the CLI exposes only `proposals reconcile-folder`, and reconciling by SHA is q00023, which still has two slices pending. The atomic apply itself is proven in `applyValidatedCandidate`'s specs (`bd2d093c7`); what is missing is the operator path the acceptance names.

## notes

- Staging DB files are intentionally NOT auto-deleted; failed runs
  remain on disk until a future `db doctor` (f00518) explicitly
  prunes them after N days.
- Transactional apply is logical, not binary; the active DB NEVER is in
  a half-updated state and never loses its operational ledgers.