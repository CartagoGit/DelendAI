---
id: q00022
title: "Proposals SQLite schema — replace proposals/INDEX.json as sole source of truth"
kind: plan
status: ready
type: proposal
track: architecture
date: 2026-09-07
shipped-in:
  - "e602df18e"
  - "ce29bb976"
  - "6e7780392"
  - "0b82bb036"
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
  - r00050
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

**Derived rows and operational ledgers are different classes of data.**
`proposals`, `plans`, `slices`, `documents`, and their relations are
Git-derived projection rows. `lifecycle_events`, `outbox`,
`reconciliation_runs`, `quarantine`, `tombstones`, `path_history`, and
`mutation_commands` are operational ledgers. Reconcile may rebuild the
projection, but it must preserve the operational ledgers because Git
cannot reconstruct retries, receipts, failed deliveries, or forensic
history.

**CHECK + FOREIGN KEY + STRICT.** Every status column has a
`CHECK(status IN (...))` constraint matching the canonical TypeScript
domain glossary, and that same parity rule applies to enum-like fields
such as `proposal.kind`, `entity_type`, `outbox.kind`, `outbox.status`,
and `quarantine.status`. STRICT is mandatory on the supported baseline;
if the runtime cannot open the DB with STRICT semantics, startup fails
closed. Every FK uses `REFERENCES ... ON DELETE RESTRICT` so the DB
refuses orphans. `PRAGMA foreign_keys = ON` at boot.

**Append-only lifecycle events.** Every status transition writes a row
into `lifecycle_events(entity_type, entity_id, from_status, to_status,
actor, source, event_revision, occurred_at)`. The DB never forgets why
something happened — even if the proposal markdown is later rewritten.

**Outbox durable queue.** Side-effects (regenerating the legacy JSON index,
notifying agents, committing the Git status file) are persisted into
`outbox(idempotency_key, kind, payload, status)` and processed
asynchronously by an `OutboxProcessor`. A crash after the SQL commit
does not lose the effect — it just retries. The write path only
enqueues; the processor is the only component allowed to mutate
delivery-state columns.

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

- **Status**: done — the package, the checksummed migration runner,
  the foreign keys, the connection pragmas and the vocabulary parity
  shipped with the earlier slices; the last open item, STRICT, is
  migration 0020, merged in `53ac0f430` (#420, 2026-09-25).
- **Files**:
  - `packages/proposals-sqlite/src/lib/migrations/0020_strict_tables.sql`
  - `packages/proposals-sqlite/src/lib/migrations.ts`
  - `packages/proposals-sqlite/src/lib/schema.ts`
  - `packages/proposals-sqlite/src/lib/sqlite-driver.spec.ts`
  - `packages/proposals-sqlite/tests/src/lib/strict-tables.spec.ts`
  - `packages/proposals-sqlite/tests/src/lib/migration-checksums.spec.ts`
  - `packages/proposals-sqlite/src/lib/sql-statements.helper.ts`
  - `packages/proposals-sqlite/tests/src/lib/sql-statements.helper.spec.ts`
- **Gate**: `bun test packages/proposals-sqlite/tests/src/lib/strict-tables.spec.ts`
- Where each acceptance item stands:
  - STRICT: only `mutation_commands` (0006) was STRICT. 0020 rebuilds the
    other twenty-four under SQLite's documented procedure (triggers
    dropped first and recreated last, rows copied, indexes recreated);
    a fresh database and an upgraded one are both entirely STRICT, and
    the upgrade keeps every row, trigger and index. `applyMigrations`
    refuses a SQLite older than 3.37, which has no STRICT tables.
  - migrations run one statement at a time: bun:sqlite's `exec` skips a
    statement that fails while running and carries on, which made a
    refused copy in 0020 drop the original table and lose its rows. The
    runner now splits each migration (strings, comments and trigger
    bodies understood) and runs statement by statement, so a failure
    throws and the transaction rolls everything back; 0020 also keeps
    AUTOINCREMENT counters (`sqlite_sequence`) across the rebuild.
  - checksummed migrations: `schema_migrations` with checksum refusal,
    pinned by `migration-checksums.spec.ts`.
  - vocabulary parity: `vocabulary.spec.ts` compares the TypeScript
    vocabularies and the SQL CHECK enums as sets, both directions.
  - `plans.proposal_id` and `slices.plan_id` reference their parents
    `ON DELETE RESTRICT`; the pragmas are applied at every connection.
- acceptance:
  - All domain tables defined in `schema.ts` use `STRICT`; opening on a runtime without STRICT support fails closed.
  - `schema_migrations(version, name, checksum, applied_at)` is the ONLY way migrations run; checksum mismatch refuses to apply.
  - Every persisted enum-like field is generated from or parity-tested against the canonical TypeScript glossary.
  - `plans.proposal_id REFERENCES proposals(id) ON DELETE RESTRICT`.
  - `slices.plan_id REFERENCES plans(id) ON DELETE RESTRICT`.
  - `PRAGMA foreign_keys = ON` + `PRAGMA journal_mode = WAL` + `PRAGMA busy_timeout = 5000` applied at every connection.
  - All tables have a corresponding `lifecycle_events` row on any write (enforced by the repository, not the schema — see S3).
  - `bun run typecheck` is green and `bunx vitest run packages/proposals-sqlite` is all green.

### S2 — Reconciler foundation: parse markdown → identity → deterministic candidate projection

- **Status**: done — `e602df18e`. `reconciler.ts`, `markdown-parser.ts` and `identity.ts` with 13 passing specs covering both `shadow` and `incremental` modes, quarantine of a proposal with no frontmatter id instead of inventing an identity, and a logical digest independent of input order. Verified 2026-09-15.
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
    - `mode: 'shadow'` — parses every file and builds an in-memory candidate projection plus deterministic digest; NEVER touches the active DB.
    - `mode: 'incremental'` — reuses the same parser/identity/candidate builder API, but DB writes remain deferred to `q00024` + `q00022 S3`.
  - For every file, `reconciler` produces a deterministic candidate or a quarantine record. NEVER `proposal_created_implicitly_from_a_read`.
  - `identity.ts` derives `uid` from frontmatter `id` first; any fallback path that cannot prove a stable identity is quarantined instead of silently inventing a new entity.
  - The same logical set of parsed proposals produces the same `logical_digest` regardless of input order.
  - Tombstones, `reconciliation_runs`, integrity checks, and transactional apply remain owned by `q00024` and `q00022 S3`.
- review-state: in_review
- review-implementer: github-copilot
### S3 — Repository layer + lifecycle_events + outbox (re-typed; logic from S1+S2 stays)

- **Status**: done — `ce29bb976`, `6e7780392`, `0b82bb036`. the proposals, plans, slices, lifecycle, outbox, quarantine and digest repositories landed with 40 passing specs across ten files. Verified 2026-09-15.
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
  - The side-ledger repos (`lifecycle-repo`, `outbox-repo`,
    `quarantine-repo`, `digest`) may land ahead of the entity repos so
    long as they stay local to `packages/proposals-sqlite` and do not
    pretend the plugin is wired yet.
  - The first entity-repo landing may be proposal-only; `plans` and
    `slices` can follow once their lifecycle semantics are modeled with
    equivalent close/transition behavior.
  - Every write method (`create`, `update`, `transition`, `close`, `quarantine`) opens its own transaction, writes the entity row + the lifecycle_events row + the outbox row, and COMMITS atomically. A failure ROLLBACKs everything.
  - `closeProposal(uid)` returns `{ kind: 'closed' | 'already_closed' | 'conflict' | 'invalid_transition' }` — never throws, never corrupts.
  - `digest.ts` produces the same sha256 for the same canonical proposal projection in different orders (canonical sorting).
  - The write path only inserts into `outbox`; only the processor mutates delivery-state columns, and no hot path hard-deletes outbox rows.

### S4 — One projection chain, then SQLite-only reads (the markdown stays the authority)

- **Status**: pending
- **Files**:
  - `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`
  - `plugins/proposals/src/lib/services/projection-refresh.ts`
  - `plugins/proposals/plugin.manifest.ts`
  - `plugins/proposals/src/lib/contracts/constants/proposal-index-source.constant.ts`
  - `plugins/proposals/src/lib/proposals/index-reader.ts`
  - `plugins/proposals/tests/src/lib/services/projection-refresh.spec.ts`
  - `packages/proposals-sqlite/src/lib/migrations/0021_registry_fields.sql`
  - `packages/proposals-sqlite/src/lib/reconciler-markdown.ts`
  - `packages/proposals-sqlite/src/lib/repository/proposals-repo.ts`
  - `packages/proposals-sqlite/src/lib/reconciler-apply-candidate.ts`
  - `packages/proposals-sqlite/src/lib/reconciler-tombstone.ts`
  - `packages/proposals-sqlite/tests/src/lib/registry-fields.spec.ts`
  - `packages/proposals-sqlite/src/lib/migrations/0023_frontmatter_json.sql`
  - `plugins/proposals/src/lib/proposals/registry-entry.helper.ts`
  - `plugins/proposals/src/lib/proposals/registry-export.service.ts`
  - `plugins/proposals/src/lib/contracts/interfaces/registry-entry.interface.ts`
  - `plugins/proposals/tests/src/lib/proposals/registry-export.service.spec.ts`
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/services/projection-refresh.spec.ts`

**Progress 2026-09-25 — phase 1 needed a step before it.** The registry
lists each proposal's `track`, `type` and `date`; the `proposals` table
held none of them (the reconciler parsed `track` and `type` and dropped
them before the write), so the registry could not be exported from the
database at all. Migration 0021 adds the three columns (nullable, the
table stays STRICT), and every write path carries them: the repository's
insert and update, the staging-to-active copy and the tombstone copy. The
unchanged-row check compares them, so the first reconcile after the
migration fills the existing rows. `registry-fields.spec.ts` covers a
fresh database, the upgrade, the projection and the fill. Still to do in
phase 1: the exporter itself, which must apply the registry's defaults
(`unspecified`, `unknown`) and its `kind`-by-prefix fallback, and the
registry's `errors` list, which comes from the scan's parse failures and
has to come from the `quarantine` table instead.

**Found 2026-09-25 — phase 1 also needs one frontmatter parser.** The
registry carries frontmatter extras too (`ownership` on 95 entries,
`reservedFiles`, `budget`, …), and the reconciler and the registry scan
read frontmatter with two different hand-written parsers that disagree on
hundreds of files (inline arrays, nested maps, comments inside values).
An export from the database could not match the scan until they read the
same values: r00643 makes proposal frontmatter parsed once, as YAML, and
phase 1 continues after its S1.

**Progress 2026-09-25 — the database keeps the frontmatter.** r00643 S1
merged (#443), so the reconciler and the registry read the same values.
Migration 0023 stores each proposal's parsed frontmatter
(`frontmatter_json`) through every write path, compared by the
unchanged-row check, so the registry's extras (`ownership`,
`reservedFiles`, `budget`, …) can be derived from the database by the
registry's own entry builder instead of a second list of columns. Next:
that builder extracted as a pure function, the exporter, and a parity
spec over the real tree.

**Progress 2026-09-25 — the registry can come from the database.** The
registry's entry builder is one pure function (`registryEntryFrom`, with
`toIndexEntry` for the file's shape), used by the markdown scan and by
`exportRegistryFromDb`. Reconciling this repository's 1,022 proposals
into a fresh database and exporting it gives exactly the registry the
scan writes: zero differences, zero errors, pinned by a spec over the
real tree. What remains of phase 1 is the switch itself — the registry
written from the export after the database is levelled, with the scan as
the declared fallback when the database cannot be read — and the
producer of `index.json` changed in the proposals manifest's
`authorities` in the same change.

**Decision 2026-09-25 — phase 1's goal is met without moving the
writer.** Phase 1 existed so the registry and the database could not
disagree. They could, because each derived its entries separately: two
frontmatter parsers and two entry builders. Now both read frontmatter
with the one parser (r00643) and both build entries with the one
builder (`registryEntryFrom` / `toIndexEntry`), and the export is proven
equal to the scan over the real tree. The only way left for them to
differ is freshness, which the leveller already closes after every
write. Writing `index.json` from the export instead of the scan would
change which of two identical derivations writes the file, not what it
contains, so it is not done; the declaration keeps the scan as the
producer.

**Found 2026-09-25 — phase 2 cannot flip the default as planned.**
`ProposalsSqliteDriver` needs the Bun runtime (`bun:sqlite`). With
`sql` as the default, a host that runs the server under Node would
refuse every proposal read (`sql-refused`) where `auto` falls back to
the registry today; the product has to work on either runtime. Phase 2
therefore needs one of: a driver that also runs on Node (`node:sqlite`,
Node 22.5+), or a default that stays `auto` wherever `bun:sqlite` is
unavailable and becomes `sql` only where it is. The read counters are
per process by design (`index-read-stats.ts`), so the "no fallback over
a window" evidence has to come from somewhere that outlives a process —
the real-tree parity spec in CI is the closest thing that exists.

**Rewritten 2026-09-25 against the tree.** The first version of this
slice named `proposal-store.ts`, `plan-store.ts`, `slice-store.ts` and
`index-regenerator.ts`; none of them exists. It also asked that writes go
to the database first and that the markdown be regenerated from the row.

**Decision: the authority stays the markdown.** Writing the database
first makes SQLite the authority and the markdown its projection. A
person who edits a proposal file directly would then have that edit
overwritten by the next regeneration, unless every write reconciled
first, and delendai governs agents; it does not get to limit the person.
`AUTHORITIES.md` (f00552) declares `docs/delendai/proposals` the authority
of `proposal-status`, with two projections: the registry
`.cache/delendai/proposals/index.json` and `.cache/delendai/state/proposals.sqlite`.
"SQLite is the operational truth" is realised here as "SQLite is the one
projection readers use", not as "SQLite is written first". Moving the
authority is the owner's call and would need its own proposal, with the
declaration changed in the same change.

What is left is to stop having two projections that readers choose
between by parity. Three phases, each ending with the declaration true:

1. **One chain.** The registry is exported from the database instead of
   being built by a second scan of the markdown: markdown → SQLite →
   registry. Parity between the two becomes true by construction. The
   declaration's producer of `index.json` changes to the exporter in
   the same change (this is r00049 S1, re-scoped to the real files).
2. **SQLite-only reads by default.** `DEFAULT_PROPOSAL_INDEX_SOURCE`
   moves from `auto` to `sql` once the reader's own counters
   (`IProposalIndexReadStats`) show no fallback over a declared window.
   `json` stays the one-line rollback.
3. **The registry leaves the read path.** It remains an export for the
   rollback until a later proposal removes it.

Acceptance:

- After a proposal tool writes, the database and the registry agree
  without a parity check deciding between them.
- `bun run lint:authorities` passes with the producer of `index.json`
  declared as the exporter.
- With the default source, a read never serves the registry; with
  `DELENDAI_PROPOSAL_INDEX_SOURCE=json` it does.
- A person's direct edit of a proposal file is what the next read
  returns, after one reconcile.

### S5 — Deterministic rebuild test: rm proposals.sqlite + reconcile == same logical digest

- **Status**: review — every acceptance item now has a spec; see the
  delivery note below.
- **Files**:
  - `packages/proposals-sqlite/tests/e2e/digest-rebuild.spec.ts`
  - `packages/proposals-sqlite/tests/e2e/lifecycle-cas-race.spec.ts`
  - `packages/proposals-sqlite/tests/e2e/rebuild-and-close.spec.ts`
- **Gate**: e2e
- acceptance:
  - The test captures `digestBefore` against a known fixture (50+ proposals, plans and slices), deletes `proposals.sqlite`, runs `reconcile({ mode: 'incremental' })`, and asserts `digestAfter === digestBefore`.
  - The test is rerun 100x and never flakes (deterministic).
  - The concurrency spec opens N transactions in parallel that try to close the same proposal; exactly one succeeds with `{ kind: 'closed' }` and the rest get `{ kind: 'already_closed' }` (no errors, no corruption).
  - The same test runs against `mode: 'shadow'` and confirms the staging DB's digest matches the active DB's digest when the active was synchronised.

Delivered 2026-09-25 (`rebuild-and-close.spec.ts`). The existing rebuild
compared the digest of the parsed candidates, a pure function of the
files and so equal by construction, in `shadow` mode. The new spec judges
what the database HOLDS — a domain digest over proposals, plans and
slices without ids, timestamps or revisions:
- deleting the database and reconciling it again with
  `reconcileIncremental` gives the same domain digest, 100 times in a row;
- the database an incremental pass builds holds exactly what a `shadow`
  build holds — the two pipelines agree on every row;
- six connections closing the same proposal with a current view: exactly
  one `closed`, five `already_closed`, one lifecycle row. Writers holding a
  stale revision get `conflict` instead (`lifecycle-cas-race.spec.ts`),
  which is the compare-and-swap r00048 specified.

## acceptance

- All S1-S5 slices land.
- `delendai reconcile --sha <commit>` is idempotent (digest-stable across N rebuilds).
- `bun run validate` stays green end-to-end across all slices.
- `q00022` is the canonical "the proposals plugin knows SQL" milestone; sibling proposals (`r00047`, `r00048`, `q00023`, `q00024`, `f00514`, `f00515`, `r00049`, `f00518`) consume its public surface.

## notes

**Reality (2026-09-23), measured against `develop` at `d43f019df`:**

- **(Superseded 2026-09-25: migration 0020 recreates every proposals table
  `STRICT`; see S1.)** S1 is delivered in substance, but its STRICT acceptance is not met.
  The package exists with 19 migrations under `src/lib/migrations/*.sql`
  (not the `schema.ts` this slice names), applied through
  `schema_migrations` with a SHA-256 checksum that refuses a mismatch. The
  connection sets `foreign_keys`, `WAL` and `busy_timeout`, and
  `plans`/`slices` reference their parents `ON DELETE RESTRICT`. But only
  **1 of the 28 tables is declared `STRICT`** (`mutation_commands`, 0006).
  The other 27, including `proposals`, `plans`, `slices`,
  `lifecycle_events` and `outbox`, use ordinary type affinity. S1 stays
  pending until a migration recreates them `STRICT` or this acceptance is
  consciously changed. External reviews had assumed STRICT was in place.
- **The read half of S4 exists, and it now has a writer to match.**
  `readProposalIndex` prefers SQLite when it is at parity with the
  registry (f00535). x00621 makes every tool that writes a proposal bring
  the database up to date by the reader's own parity verdict, so "prefer
  SQLite" applies after a transition too, not only after a manual sync.
  Writes are still markdown-first; routing them through the repository is
  the rest of S4.
- **Every phase needs its authority stated.** While the authority moves
  from markdown to SQLite, each reader and writer has to agree on which
  copy is the truth at that phase. f00552 makes that declaration checkable
  instead of prose.

- The proposals plugin's filesystem remains the durable historical record
  (the markdown files ARE the source of truth for humans); SQLite is the
  operational truth. They MUST converge at every reconcile run via the
  `logical_digest` invariant, otherwise reconciliation has bugs.
- This is a multi-slice proposal; each slice closes independently under
  peer review, and the WHOLE plan only moves to `done` when the digest
  rebuild test (S5) passes.