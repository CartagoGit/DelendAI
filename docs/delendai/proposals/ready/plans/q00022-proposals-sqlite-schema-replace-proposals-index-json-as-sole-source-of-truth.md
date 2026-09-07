---
id: q00022
title: "Proposals SQLite schema — replace proposals/INDEX.json as sole source of truth"
kind: plan
status: ready
type: proposal
track: architecture
date: 2026-09-07
priority: P0
audit-source:
  file: docs/delendai/audits/2026-09-07-develop-external-audit.md
  finding: AUD-INDEX-002 + AUD-LIFECYCLE-005
  snapshot: 91bbbff76ce35452c8c8b6e3bf2129a490bf7c94
parent-plan: q00018
related:
  - q00018
  - q00019
  - x00510
  - r00047
  - r00048
  - q00023
  - q00024
  - f00514
  - f00515
  - r00049
---

# q00022 — Proposals SQLite schema (replaces proposals/INDEX.json)

## Goal

Establish a strict SQLite-backed operational truth for **the proposals
plugin itself** (not the State Engine — that is `q00019`). After this
proposal lands, every read of `proposals/`, `plans/` and `slices/` (their
status, slices, lifecycle, relations, reconciliations, candidates and
quarantine) is served from `.delendai/state/proposals.sqlite`, and
`docs/delendai/proposals/INDEX.json` (plus `plans/INDEX.json` and
`proposals/slices/INDEX.json`) become a derived, regenerable export —
never authoritative.

The audit identified this as P0 because the current "dual source of
truth" is exactly the failure mode that lets proposals end up "corrupt and
unclosable".

## Why

The proposals plugin currently has THREE different sources of truth:

1. `proposals/<id>.md` files (the actual entities).
2. `proposals/INDEX.json` (the catalogue of all entities).
3. `proposals/slices/INDEX.json` and `plans/INDEX.json` (sub-indexes).

Every `close_proposal` flow has to update all three in sequence, and any
crash mid-sequence leaves the index out of sync with the filesystem —
the exact symptom the user reported as "propuestas que luego no es capaz
de cerrar".

The audit summarises the risk very clearly:

> El bug conceptual que más protegería: una operación distribuida entre
> archivos. Un cierre probablemente involucra conceptualmente cosas como:
> 1. localizar proposal, 2. actualizar proposal, 3. actualizar INDEX,
> 4. modificar plan, 5. modificar slice, 6. archivar algo, 7. actualizar
> otro índice. Si falla entre 3 y 4: CRASH → proposal cerrado, index
> abierto, plan activo, slice X. Y el siguiente cierre ya no sabe qué
> representación creer.

`q00019` already laid the SQLite shadow driver for the **State Engine**
itself (`@delendai/state`). This proposal does the same for the
**proposals plugin**: a separate `proposals.sqlite` with its own schema
covering proposals, plans, slices, their relations, revisions, lifecycle
events, candidate proposals, reconciliation runs, quarantine, outbox,
and schema migrations.

## Why this design

**One operational DB per subsystem.** The State Engine already has its
own SQLite DB via `@delendai/state-sqlite`. The proposals plugin has a
different shape (proposals ↔ plans ↔ slices with their own relationships
and lifecycle), so a separate file is the cleanest split. Cross-system
links are by stable id, never by shared DB.

**Internal id + stable uid.** Each entity has:
- `id INTEGER PRIMARY KEY AUTOINCREMENT` (internal; never exposed).
- `uid TEXT UNIQUE NOT NULL` (the canonical handle: `p-00510`, `q-00022`,
  `r-00047`, etc.).
- `slug TEXT` (derived from frontmatter, used for filenames).

Paths are NOT identity — rename, move and reindex keep `uid` stable,
so the same conceptual entity survives a filesystem reshuffle.

**CHECK + FOREIGN KEY + STRICT.** Every status column has a
`CHECK(status IN (...))` constraint matching the lifecycle state machine
in `r00047`. Every FK uses `REFERENCES ... ON DELETE RESTRICT` so the
DB refuses orphans. `PRAGMA foreign_keys = ON` at boot.

**Append-only lifecycle events.** Every status transition writes a row
into `lifecycle_events(entity_type, entity_id, from_status, to_status,
actor, source, event_revision, occurred_at)`. The DB never forgets why
something happened — even if the proposal markdown is later rewritten.

**Outbox pattern.** Side-effects (regenerating the legacy JSON index,
notifying agents, committing the Git status file) are persisted into
`outbox(idempotency_key, kind, payload, status)` and processed
asynchronously by an `OutboxProcessor`. A crash after the SQL commit
does not lose the effect — it just retries.

**Quarantine, not silent drop.** Anything that fails to parse or validate
becomes a row in `quarantine(source_path, blob_sha, error_code,
raw_metadata, run_id, status)` plus a `quarantined` event in
`lifecycle_events`. The original entity is never silently lost.

**Deterministic logical digest.** Every reconcile run writes a row into
`reconciliation_runs(source_commit, source_tree, schema_version,
reconciler_version, files_seen, files_changed, entities_created,
entities_updated, entities_deleted, entities_quarantined,
logical_digest, started_at, completed_at, status)`. The digest is
`sha256(canonical(proposals) + canonical(plans) + canonical(slices) +
canonical(relations))` — same SHA + same schema + same reconciler ⇒
same digest. This is the "rm sqlite && reconcile && same digest" test
that the audit calls obligatory.

## non-goals

- Do NOT migrate `@delendai/state` SQLite to the proposals DB; the two
  systems stay separate (q00019 owns the State Engine DB).
- Do NOT change the public MCP tool surface in this slice family beyond
  adding `proposals_db_*` diagnostic tools (f00518). Tools keep their
  current names; the SQL is invisible behind them.
- Do NOT deprecate the legacy `INDEX.json` files in this proposal.
  `r00049` handles the deprecation once Phase B has shipped.
- Do NOT touch the lifecycle state machine — `r00047` owns that.
- Do NOT introduce CAS yet — `r00048` owns that.

## Slices

- global_gate: lint

### S1 — packages/proposals-sqlite (new package): schema, migrations, FK + CHECK + STRICT

- **Status**: pending
- **Files**:
  - `packages/proposals-sqlite/package.json` (new)
  - `packages/proposals-sqlite/tsconfig.json` (new)
  - `packages/proposals-sqlite/vitest.config.ts` (new)
  - `packages/proposals-sqlite/src/public/index.ts` (new)
  - `packages/proposals-sqlite/src/lib/schema.ts` (new — migrations 0001..0005)
  - `packages/proposals-sqlite/src/lib/sqlite-driver.ts` (new — WAL, busy timeout, FK on)
  - `packages/proposals-sqlite/src/lib/fail-closed.ts` (new — error mapping)
  - `packages/proposals-sqlite/src/lib/registry.ts` (new — pure repository)
  - `packages/proposals-sqlite/src/lib/migrations.ts` (new — applies 0001..0005)
  - `packages/proposals-sqlite/tests/src/lib/schema.spec.ts` (new)
  - `packages/proposals-sqlite/tests/src/lib/sqlite-driver.spec.ts` (new)
  - `packages/proposals-sqlite/tests/src/lib/migrations.spec.ts` (new)
  - `packages/proposals-sqlite/tests/src/lib/registry.spec.ts` (new)
- **Gate**: type
- acceptance:
  - All tables defined in `schema.ts` with `STRICT` typing where supported.
  - `schema_migrations(version, name, checksum, applied_at)` is the ONLY way migrations run; checksum mismatch refuses to apply.
  - `proposals.status CHECK (status IN ('draft','ready','in-progress','review','blocked','paused','done','retired','superseded','quarantined'))`.
  - `plans.proposal_id REFERENCES proposals(id) ON DELETE RESTRICT`.
  - `slices.plan_id REFERENCES plans(id) ON DELETE RESTRICT`.
  - `PRAGMA foreign_keys = ON` + `PRAGMA journal_mode = WAL` + `PRAGMA busy_timeout = 5000` applied at every connection.
  - All tables have a corresponding `lifecycle_events` row on any write (enforced by the repository, not the schema — see S3).
  - `bun run typecheck` is green and `bunx vitest run packages/proposals-sqlite` is all green.

### S2 — Reconciler: parse markdown → staged insert → FK + integrity check → promote

- **Status**: pending
- **Files**:
  - `packages/proposals-sqlite/src/lib/reconciler.ts` (new)
  - `packages/proposals-sqlite/src/lib/markdown-parser.ts` (new — pure, no I/O)
  - `packages/proposals-sqlite/src/lib/identity.ts` (new — uid derivation from frontmatter)
  - `packages/proposals-sqlite/tests/src/lib/reconciler.spec.ts` (new)
  - `packages/proposals-sqlite/tests/src/lib/markdown-parser.spec.ts` (new)
  - `packages/proposals-sqlite/tests/src/lib/identity.spec.ts` (new)
- **Gate**: type
- acceptance:
  - `reconcile({ sourceCommit, sourceTree, files })` runs in TWO modes:
    - `mode: 'shadow'` — parses every file, runs integrity_check, but writes to a separate DB file (`*.staging.sqlite`); NEVER touches the active DB.
    - `mode: 'incremental'` — opens an IMMEDIATE transaction in the active DB, runs FK + integrity_check at the end, and ROLLBACKs on any failure.
  - For every file, `reconciler` produces one of: `proposal_inserted | proposal_updated | proposal_unchanged | proposal_quarantined`. NEVER `proposal_created_implicitly_from_a_read`.
  - `identity.ts` derives `uid` from frontmatter `id` first, then from filename prefix, then from `slug`. The same physical path produces the same `uid` across rebuilds.
  - Tombstones (file removed) become `tombstone(uid, deleted_at, last_seen_at)` rows, never hard deletes.
  - `reconciliation_runs` gets exactly one row per invocation, with `logical_digest` populated.

### S3 — Repository layer + lifecycle_events + outbox (re-typed; logic from S1+S2 stays)

- **Status**: pending
- **Files**:
  - `packages/proposals-sqlite/src/lib/repository/proposals-repo.ts` (new)
  - `packages/proposals-sqlite/src/lib/repository/plans-repo.ts` (new)
  - `packages/proposals-sqlite/src/lib/repository/slices-repo.ts` (new)
  - `packages/proposals-sqlite/src/lib/repository/lifecycle-repo.ts` (new)
  - `packages/proposals-sqlite/src/lib/repository/outbox-repo.ts` (new)
  - `packages/proposals-sqlite/src/lib/repository/quarantine-repo.ts` (new)
  - `packages/proposals-sqlite/src/lib/repository/digest.ts` (new — sha256 over canonical projections)
  - `packages/proposals-sqlite/tests/src/lib/repository/*.spec.ts` (new — one per repo)
- **Gate**: type
- acceptance:
  - Every write method (`create`, `update`, `transition`, `close`, `quarantine`) opens its own transaction, writes the entity row + the lifecycle_events row + the outbox row, and COMMITS atomically. A failure ROLLBACKs everything.
  - `closeProposal(uid)` returns `{ kind: 'closed' | 'already_closed' | 'conflict' | 'invalid_transition' }` — never throws, never corrupts.
  - `digest.ts` produces the same sha256 for the same set of rows in different orders (canonical sorting).
  - `outbox_repo` only inserts; deletion happens from the processor, never from a write path.

### S4 — Wire the proposals plugin: read paths go through the repo; writes keep their existing tools but route to the repo

- **Status**: pending
- **Files**:
  - `plugins/proposals/src/lib/services/proposal-store.ts` (modified)
  - `plugins/proposals/src/lib/services/plan-store.ts` (modified)
  - `plugins/proposals/src/lib/services/slice-store.ts` (modified)
  - `plugins/proposals/src/lib/services/index-regenerator.ts` (modified — now exports `delendai export legacy-indices`)
  - `plugins/proposals/src/lib/services/quarantine.ts` (new — quarantine surface)
  - `plugins/proposals/src/index.ts` (modified — register the new path)
  - `plugins/proposals/tests/src/lib/services/*.spec.ts` (new + updated)
- **Gate**: type
- acceptance:
  - Every existing read tool (`proposals_get`, `proposals_list`, `proposals_search`, `proposal_board`, `plans_get`, `plans_list`, `slices_get`, `slices_list`, `proposals_locate`, `auto_work`) sources its data from `proposals-sqlite` ONLY.
  - Every existing write tool (`create_proposal`, `proposals_transition`, `proposals_close_slice`, `proposals_close_plan`) writes to the active DB through the repo; the markdown file is regenerated from the row AFTER the SQL commit succeeds.
  - `proposals_sync_proposals` becomes the alias for `reconcile({ mode: 'incremental' })`. Its result includes `reconciliation_runs.last`.
  - `delendai export legacy-indices` regenerates `INDEX.json`, `plans/INDEX.json`, `proposals/slices/INDEX.json` from the active DB. The export is idempotent.
  - All existing tests pass with no semantic regressions; the new path is exercised by a parity spec that runs every reconciler invariant on the same fixtures.

### S5 — Deterministic rebuild test: rm proposals.sqlite + reconcile == same logical digest

- **Status**: pending
- **Files**:
  - `packages/proposals-sqlite/tests/e2e/digest-rebuild.spec.ts` (new)
  - `packages/proposals-sqlite/tests/e2e/concurrency.spec.ts` (new)
- **Gate**: e2e
- acceptance:
  - The test captures `digestBefore` against a known fixture (50+ proposals, plans and slices), deletes `proposals.sqlite`, runs `reconcile({ mode: 'incremental' })`, and asserts `digestAfter === digestBefore`.
  - The test is rerun 100x and never flakes (deterministic).
  - The concurrency spec opens N transactions in parallel that try to close the same proposal; exactly one succeeds with `{ kind: 'closed' }` and the rest get `{ kind: 'already_closed' }` (no errors, no corruption).
  - The same test runs against `mode: 'shadow'` and confirms the staging DB's digest matches the active DB's digest when the active was synchronised.

## acceptance

- All S1-S5 slices land.
- `delendai reconcile --sha <commit>` is idempotent (digest-stable across N rebuilds).
- `bun run validate` stays green end-to-end across all slices.
- `q00022` is the canonical "the proposals plugin knows SQL" milestone; sibling proposals (`r00047`, `r00048`, `q00023`, `q00024`, `f00514`, `f00515`, `r00049`, `f00518`) consume its public surface.

## notes

- The proposals plugin's filesystem remains the durable historical record
  (the markdown files ARE the source of truth for humans); SQLite is the
  operational truth. They MUST converge at every reconcile run via the
  `logical_digest` invariant, otherwise reconciliation has bugs.
- This is a multi-slice proposal; each slice closes independently under
  peer review, and the WHOLE plan only moves to `done` when the digest
  rebuild test (S5) passes.