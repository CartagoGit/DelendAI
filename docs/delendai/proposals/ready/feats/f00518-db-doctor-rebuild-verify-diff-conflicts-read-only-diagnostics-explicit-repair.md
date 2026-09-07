---
id: f00518
title: "db doctor / rebuild / verify / diff / conflicts — read-only diagnostics + explicit repair"
kind: feat
status: ready
type: proposal
track: architecture
date: 2026-09-07
priority: P0
audit-source:
  file: docs/delendai/audits/2026-09-07-develop-external-audit.md
  finding: AUD-DOCTOR-035
  snapshot: 91bbbff76ce35452c8c8b6e3bf2129a490bf7c94
related:
  - q00022
  - f00515
  - f00519
---

# f00518 — db doctor / rebuild / verify / diff / conflicts

## Goal

Add a coherent set of read-only diagnostic tools — and exactly ONE
explicit, opt-in repair tool — for the proposals SQLite DB:

1. `proposals_db_doctor` — read-only; surfaces integrity, FK,
   orphans, duplicate natural IDs, revision inconsistencies,
   quarantined imports, stale reconciliation, Git SHA mismatch,
   outbox backlog, lifecycle anomalies.
2. `proposals_db_rebuild` — explicit destructive tool: rebuilds the
   active DB from the canonical Git SHA. Requires `--apply` and a
   `--confirm` flag.
3. `proposals_db_verify` — read-only; runs the canonical test
   `rm sqlite && reconcile && same digest` against a clone of the
   active DB and reports the result.
4. `proposals_db_diff` — read-only; given two SHAs, returns the
   diff in entities, lifecycle events, and outbox state.
5. `proposals_conflicts` — read-only; returns every entity whose
   current revision does not match the expected revision recorded in
   the most recent `reconciliation_runs`.

The audit marks `db doctor` as 10/10 value, with the explicit warning
that doctor must be read-only and the repair tool must be an explicit
separate command:

> Reparación ≠ mutación automática. Importante:
> `delendai db doctor` debería ser read-only. Y: `delendai db repair`
> explícito. No haría un: `doctor()` → encontró algo → cambió DB. Es
> exactamente el tipo de efecto lateral que queremos eliminar.

## Why

Today the only way to diagnose "what's wrong with the proposals DB" is
to run ad-hoc SQLite queries or read the filesystem. That is
operationally untenable at scale. `db doctor` is the single tool the
operator runs first; `db repair` (here: `db rebuild --apply`) is the
explicit, audited escape hatch.

## Why this design

**Read-only by default.** All five tools except `db rebuild` open a
read transaction; `db rebuild` requires `--apply` AND `--confirm
<sha>` AND prints a clear "this rebuilds the active DB from
<sha>" warning before doing anything.

**Doctor checks are individual, not bundled.** Each doctor check is
its own function returning a `IDoctorCheck` with `name`, `severity`,
`message`, optional `affectedUids`. The host (or the doctor output
view in apps/web) renders the list; the tool itself never auto-fixes.

**Verify uses a temp DB.** `db verify` opens a SECOND connection at a
temp path, runs the rebuild, and compares the digest. The active DB
is never opened for write.

**Diff is git-aware.** `db diff` accepts two SHAs and computes the
diff by running the same `reconcile` against each SHA into two temp
DBs and diffing the projections. Hosts can pass `--since <sha> --until
<sha>` for the "what changed between these commits" use case.

## non-goals

- Do NOT add a generic `db repair` tool; every repair is its own
  explicit command (`db rebuild --apply`, `db promote`,
  `db quarantine-resolve`, etc.).
- Do NOT change any doctor check's output format without a version
  bump.

## Slices

- global_gate: lint

### S1 — `proposals_db_doctor` and its individual checks

- **Status**: pending
- **Files**:
  - `plugins/proposals/src/lib/tools/db-doctor.tool.ts` (new)
  - `plugins/proposals/src/lib/services/db-doctor.ts` (new — runs
    each check, aggregates results)
  - `plugins/proposals/src/lib/services/db-doctor/checks/*.ts`
    (new — one file per check)
  - `plugins/proposals/tests/src/lib/services/db-doctor.spec.ts`
    (new)
- **Gate**: type
- acceptance:
  - The doctor tool exposes at least: integrity, FK, orphans,
    duplicate natural IDs, invalid statuses, missing relations,
    revision inconsistencies, quarantined imports, stale
    reconciliation, Git SHA mismatch, outbox backlog, lifecycle
    anomalies.
  - Each check returns `IDoctorCheck`; the tool returns a list.
  - No check writes to the DB. The test asserts the active DB is
    byte-identical before and after the doctor runs.
  - `bun run typecheck` green.

### S2 — `proposals_db_rebuild` with `--apply --confirm` and explicit SHA

- **Status**: pending
- **Files**:
  - `plugins/proposals/src/lib/tools/db-rebuild.tool.ts` (new)
  - `plugins/proposals/src/lib/services/db-rebuild.ts` (new —
    wraps the staging/promote flow from q00024)
  - `plugins/proposals/tests/src/lib/tools/db-rebuild.tool.spec.ts`
    (new)
- **Gate**: type
- acceptance:
  - Without `--apply`, the tool reports what WOULD happen and
    exits without writing.
  - With `--apply` and no `--confirm`, the tool prints the proposed
    SHA and exits.
  - With `--apply --confirm <sha>`, the tool calls
    `reconcile({ mode: 'shadow', sha })` and then
    `promoteStaging()`. Active DB is replaced atomically.
  - The tool emits an outbox event with the new `logical_digest`.

### S3 — `proposals_db_verify`, `proposals_db_diff`, `proposals_conflicts`

- **Status**: pending
- **Files**:
  - `plugins/proposals/src/lib/tools/db-verify.tool.ts` (new)
  - `plugins/proposals/src/lib/tools/db-diff.tool.ts` (new)
  - `plugins/proposals/src/lib/tools/conflicts.tool.ts` (new)
  - `plugins/proposals/src/lib/services/db-verify.ts` (new —
    opens a temp DB, rebuilds, compares digest)
  - `plugins/proposals/src/lib/services/db-diff.ts` (new)
  - `plugins/proposals/src/lib/services/conflicts.ts` (new)
  - `plugins/proposals/tests/src/lib/services/*.spec.ts` (new)
- **Gate**: type
- acceptance:
  - `db_verify` runs the canonical "rm sqlite && reconcile" test
    against a temp DB and reports `{ digestBefore, digestAfter,
    match: boolean, durationMs }`.
  - `db_diff` accepts two SHAs and returns the entity / event /
    outbox diff in canonical JSON.
  - `conflicts` lists every entity whose current revision differs
    from the expected revision recorded in the most recent
    `reconciliation_runs`.

## acceptance

- All S1-S3 slices land.
- `proposals_db_doctor` is the canonical "what's wrong" tool.
- `proposals_db_rebuild --apply --confirm <sha>` is the canonical
  recovery tool.
- The audit's `db doctor = 10/10` recommendation is satisfied.

## notes

- The doctor output is JSON; apps/web renders it as a dashboard.
  extensions/vscode renders it as a tree view in the sidebar.
- `db rebuild` is intentionally heavy; it is for emergencies.
  Routine rebuilds use the normal `reconcile` flow.