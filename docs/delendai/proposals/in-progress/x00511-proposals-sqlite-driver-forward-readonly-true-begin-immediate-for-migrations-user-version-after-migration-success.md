---
id: x00511
title: "proposals-sqlite driver: forward `readonly: true`, `BEGIN IMMEDIATE` for migrations, `user_version` after migration success"
kind: fix
status: in-progress
type: proposal
track: proposals-sqlite
date: 2026-09-07
priority: P0
audit-source:
  file: docs/delendai/audits/2026-09-07-develop-external-audit.md
  finding: AUD-READ-WRITE-001 + AUD-MIGRATION-001 + AUD-SCHEMA-INVARIANT-001
  snapshot: 4a5d132add80cd1a182fd9dce73a5a2ed15cc229
related:
  - x00510
  - q00022
  - q00025
  - r00048
last-transition-id: t-2026-09-07-x00511-start
last-correlation-id: c-2026-09-07-x00511-1
last-transition-from: ready
last-idempotency-key: idem-2026-09-07-x00511-start
---

# x00511 — proposals-sqlite driver: readonly + IMMEDIATE + user_version ordering

## Goal

Repair three concrete correctness issues in
`packages/proposals-sqlite/src/lib/` that the external review of HEAD
`4a5d132add80cd1a182fd9dce73a5a2ed15cc229` flagged as P0 / P1:

1. **`IProposalsSqliteDriverOptions.readonly` is silently broken.** The
   constructor currently writes:

   ```ts
   this.db = new Database(options.path, {
       create: !options.readonly,
       strict: true,
   });
   ```

   so a "read-only" connection still accepts writes — `readonly: true`
   is never forwarded to `new Database()`. This defeats the `READ ≠ WRITE`
   invariant `x00510` is installing at the type layer; the storage layer
   lets the same handle mutate. P0.

2. **`applyMigrations` claims IMMEDIATE but uses DEFERRED.** The
   docstring says "Each migration runs in its own IMMEDIATE transaction"
   and the code does:

   ```ts
   const tx = db.transaction(() => { … });
   tx();
   ```

   `db.transaction(fn)()` in `bun:sqlite` produces `BEGIN` (DEFERRED).
   The API exposes `tx.immediate()` for `BEGIN IMMEDIATE`. With several
   agents/writers this lets two migrations interleave. P0.

3. **`PRAGMA user_version` is set BEFORE migrations.** `SQLITE_BOOT_PRAGMAS`
   currently contains `PRAGMA user_version = ${PROPOSALS_SQLITE_SCHEMA_VERSION}`
   and the driver runs the boot PRAGMAs before `applyMigrations`. A
   migration that throws midway can leave `user_version = 5` while
   `schema_migrations` has fewer rows — the two indicators can lie to
   each other. The fix is to remove `user_version` from the boot list
   and write it (inside the same `BEGIN IMMEDIATE` that just committed
   the last migration) only after the migrations succeed. P1.

After this proposal lands:

- `readonly: true` produces a true read-only handle. Mutations on it
  throw.
- Each migration runs under `BEGIN IMMEDIATE`; the call shape is
  pinned by a spec so a future refactor cannot regress it to
  `tx()` (DEFERRED).
- `user_version` is set only after a successful migration sweep. A
  half-applied schema leaves `user_version` at the OLD value.

## Why

The proposals plugin is being migrated to SQLite as the operational
truth (parent plan `q00022`) and to enforce `READ ≠ WRITE` at the
type layer (`x00510`). Three concurrent audits / reviews converge on
the same observation: a read-only option which is not actually
read-only defeats the second invariant at the storage layer; a
deferred-transaction migrations engine lets two writers interleave
migrations; `user_version` ahead of reality defeats any tool that
takes its truth from `PRAGMA user_version`.

None of the existing ready proposals (`x00510`, `q00022`, `r00047`,
`r00048`, `q00023`, `q00024`, `f00514`, `f00515`, `r00049`, `f00518`)
covers these three concrete code-level fixes. `q00022` S1 acceptance
covers "PRAGMA foreign_keys = ON + journal_mode = WAL + busy_timeout"
but never pins `readonly: true` semantics, IMMEDIATE transactions or
the ordering of `user_version`.

## Why this design

**Patching three lines, not redesigning the driver.** The driver is
intentionally dumb (`README`: "it does not implement any business
logic"). All three fixes are local: one boolean flag forwarded, one
`.immediate()` call shape, one line moved from a list to a single
`exec` after the loop. No new module, no new abstraction.

**Pin the call shape with a test, not a comment.** The third reviewer
in a row missed the `tx()` vs `tx.immediate()` regression because
"IMMEDIATE" in a docstring is not enforceable. We replace the
docstring-trust with a `Database.prototype.transaction` monkey-patch
that asserts every migrations path calls `.immediate()` and the
read-only path never calls it. A future edit that drops the `.immediate()`
fails CI.

**Two-step `user_version` write, not a single PRAGMA upgrade.** We
keep the boot PRAGMAs pure (FK / WAL / busy_timeout), and the
migrations engine ends with `db.exec(\`PRAGMA user_version = …\`)` —
the single statement that advances the boot PRAGMA-style read of the
schema. This keeps `user_version` tightly bound to a successful
migration sweep.

## non-goals

- Do NOT add new repos / lifecycle events / outbox — that is `q00022 S3`.
- Do NOT change the public MCP surface.
- Do NOT introduce a custom transaction wrapper or new migration runner.
- Do NOT touch `bun:sqlite` API in any way other than passing
  `readonly: true` and calling `.immediate()`.
- Do NOT add a separate `rebuild-from-scratch` flow — that is
  `f00518` (`db doctor/rebuild/verify/diff`).

## Slices

- global_gate: lint

### S1 — Forward `readonly: true`, switch migrations to `BEGIN IMMEDIATE`, move `user_version` past migration success

- **Status**: pending
- **Files**:
  - `packages/proposals-sqlite/src/lib/sqlite-driver.ts`
  - `packages/proposals-sqlite/src/lib/migrations.ts`
  - `packages/proposals-sqlite/src/lib/schema.ts`
  - `packages/proposals-sqlite/src/lib/sqlite-driver.spec.ts`
- **Gate**: type
- acceptance:
  - `ProposalsSqliteDriver` opens the underlying `Database` with
    `readonly: !!options.readonly` whenever `options.readonly === true`;
    the `create` flag is unchanged. The constructor passes both flags
    so a single boolean is the single source of truth.
  - When `options.readonly === true`, calling `INSERT`/`UPDATE`/`DELETE`
    or any schema mutation throws (Bun enforces the read-only handle).
    A new spec asserts this with a minimal table.
  - When `options.readonly === true`, migrations are NOT applied (the
    existing `if (!options.readonly)` guard is preserved). A new spec
    asserts `schema_migrations` is absent.
  - `applyMigrations` uses `db.transaction(() => {...}).immediate()`
    so each migration runs under `BEGIN IMMEDIATE`. The docstring in
    `migrations.ts` is unchanged in meaning (it already said IMMEDIATE)
    but a short inline comment pins the call shape so the next reader
    does not regress it.
  - A new spec pins the call shape: monkey-patch
    `Database.prototype.transaction` and assert that the migrations
    path invokes `.immediate()` for each migration, and the read-only
    path never invokes it.
  - `PRAGMA user_version = ${SCHEMA_VERSION}` is removed from
    `SQLITE_BOOT_PRAGMAS`. After `applyMigrations` finishes
    successfully, the driver writes the new `user_version` (single
    `exec`, also under IMMEDIATE so it shares the lock). The
    `currentSchemaVersion(db)` helper used by the driver is kept as the
    primary read of truth and prefers `schema_migrations` over
    `PRAGMA user_version` (the existing MAX(version) query is fine).
  - A new spec asserts that when migrations are mid-flight (force a
    throw before the final `user_version` write), `PRAGMA user_version`
    reports the OLD value (or 0 on a fresh DB) and `schema_migrations`
    reports the NEW count — never the inverse. The test asserts both
    readings via two separate reads after the throw.
  - `bunx vitest run packages/proposals-sqlite` is all green
    (existing 9 tests + 3 new tests).
  - `bun run typecheck` is green.
  - `bun run lint` is green (or rebaselined with a one-line entry that
    justifies the new test names — preferred).

## acceptance

- `readonly: true` is a real read-only handle (mutations throw).
- Each migration runs under `BEGIN IMMEDIATE` and is enforced by a test.
- `user_version` advances only on a successful migration sweep and the
  two indicators (`user_version`, `schema_migrations`) cannot disagree.
- `bun run validate` is green end-to-end.

## notes

- This is a small, surgical follow-up to `q00022 S1` and the SQLite
  package landed in commits `1b08bd591`..`4a5d132ad`. The driver
  already supports `readonly` and the `if (!options.readonly)` guard
  is already in place; the missing piece is forwarding `readonly: true`
  to `new Database()`.
- The `currentSchemaVersion(db)` helper reads `schema_migrations`,
  not `user_version`, so this proposal does not change the
  *primary* read; it only changes when `user_version` is written.
- `x00510 S3` (`proposals_db_status` diagnostic tool) consumes the
  read-only handle and benefits from the contract this proposal
  installs.