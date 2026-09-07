---
id: r00049
title: "INDEX.json becomes a derived view, not an authoritative source"
kind: refactor
status: ready
type: proposal
track: architecture
date: 2026-09-07
priority: P0
audit-source:
  file: docs/delendai/audits/2026-09-07-develop-external-audit.md
  finding: AUD-INDEX-AUTHORITY-015
  snapshot: 91bbbff76ce35452c8c8b6e3bf2129a490bf7c94
related:
  - q00022
  - f00514
---

# r00049 — INDEX.json as derived view

## Goal

Demote `docs/delendai/proposals/INDEX.json`,
`docs/delendai/proposals/plans/INDEX.json`, and
`docs/delendai/proposals/slices/INDEX.json` from authoritative sources
to **derived exports** generated from the active SQLite DB. After this
proposal lands:

1. The proposals plugin reads ONLY from SQLite (q00022).
2. The three `INDEX.json` files are written by an explicit
   `delendai export legacy-indices` command (or by the outbox
   processor in `f00514`).
3. The legacy index files may be deleted, regenerated, or replaced at
   any time without losing truth — the DB is the truth.

## Why

> INDEX.json debería dejar de ser infraestructura. Durante la
> transición: SQLite → INDEX.json, si necesitas mantener
> compatibilidad. Pero no: SQLite ↔ INDEX.json. El JSON se debería
> convertir en una vista/exportación derivada. Ejemplo:
> `delendai export legacy-indices`. Así puedes regenerarlo tantas
> veces como quieras. Una vez que SQL sea estable: INDEX.json =
> deprecated y finalmente eliminarlo. El README todavía documenta los
> índices JSON como autoritativos, por lo que esa documentación
> debería cambiar cuando se complete el corte.

Today every read path goes through the JSON index. Every write has to
update the index AND the markdown AND the SQL — three places that can
diverge. Once SQLite is in place, the JSON becomes a cache, and
keeping it authoritative just adds a second source of bugs.

## Why this design

**Single direction.** SQLite → INDEX.json. Never INDEX.json → SQLite.
The plugin refuses to ingest a JSON file (the only place JSON was a
source was the proposals plugin's read path, which now reads from SQL).

**Generated on demand.** The `delendai export legacy-indices` command
is a thin wrapper around a `LegacyIndexExporter` repository method
that reads the active DB and writes the three files. The operation is
idempotent.

**Outbox-driven regeneration.** When the outbox (f00514) detects a
write that should produce a regenerated index, it enqueues a
`regenerate-index` row. The processor (f00514 S3) drains it. The
JSON file is never written from inside the user's transaction.

**README + scripts updated.** The bootstrap docs no
  longer describe `INDEX.json` as authoritative; they describe it as
a regeneration target.

## non-goals

- Do NOT delete the legacy JSON files in this proposal — that's the
  `Phase D` cleanup, after the SQLite cutover has been verified.
- Do NOT change the public MCP tool names.

## Slices

- global_gate: lint

### S1 — `LegacyIndexExporter` reads from SQLite and writes the three JSON files atomically

- **Status**: pending
- **Files**:
  - `packages/proposals-sqlite/src/lib/exporters/legacy-indices.ts`
    (new — pure exporter that takes a snapshot and writes JSON)
  - `plugins/proposals/src/lib/tools/export-legacy-indices.tool.ts`
    (new — `delendai export legacy-indices`)
  - `plugins/proposals/src/lib/services/index-regenerator.ts`
    (modified — calls the SQLite exporter, no longer reads the JSON)
  - `plugins/proposals/tests/src/lib/services/index-regenerator.spec.ts`
    (modified)
  - `plugins/proposals/tests/src/lib/tools/export-legacy-indices.tool.spec.ts`
    (new)
- **Gate**: type
- acceptance:
  - `exportLegacyIndices({ outputDir })` reads from SQLite and
    writes the three JSON files in one directory walk; failures
    leave the directory untouched.
  - The exporter is idempotent — running it twice produces
    byte-identical JSON.
  - The tool returns `{ proposalCount, planCount, sliceCount,
    generatedAt, sourceCommit }`.

### S2 — Read path goes through SQLite only (the JSON files become irrelevant to the plugin)

- **Status**: pending
- **Files**:
  - `plugins/proposals/src/lib/services/proposal-store.ts`
    (modified — removes the JSON read path)
  - `plugins/proposals/src/lib/services/plan-store.ts` (modified)
  - `plugins/proposals/src/lib/services/slice-store.ts` (modified)
  - `plugins/proposals/src/lib/services/sync-proposals.ts`
    (modified — `sync_proposals` is now the `reconcile` verb from q00022)
  - `plugins/proposals/tests/src/lib/services/*.spec.ts` (new +
    updated)
- **Gate**: type
- acceptance:
  - All read paths in the plugin source code go through the
    `@delendai/proposals-sqlite` repository. No code reads
    `INDEX.json` directly.
  - The Markdown files remain on disk for reviewability, but the
    plugin never parses them on the read path.
  - `bun run typecheck` green.

### S3 — Outbox hook regenerates the JSON after every entity write

- **Status**: pending
- **Files**:
  - `packages/proposals-sqlite/src/lib/outbox/handlers/regenerate-index.ts`
    (already added in f00514; this slice wires it from every entity
    write)
  - `packages/proposals-sqlite/src/lib/repository/proposals-repo.ts`
    (modified — emits the outbox row)
  - `packages/proposals-sqlite/tests/e2e/regenerate-on-write.spec.ts`
    (new)
- **Gate**: e2e
- acceptance:
  - Every successful `create`, `update`, `transition`, `close` emits
    an outbox row of kind `regenerate-index` with the right
    `idempotency_key`.
  - The outbox processor runs the regeneration asynchronously.
  - The e2e test does a write and verifies the JSON file matches the
    SQLite state within one tick.

### S4 — README + scripts updated: INDEX.json is a regeneration target, not a source

- **Status**: pending
- **Files**:
  - `README.md` (modified)
  - `docs/delendai/proposals/README.md` (modified — already exists
    per the workspace listing)
  - `docs/delendai/proposals/INDEX.json` — the file becomes a build
    artefact, generated from `delendai export legacy-indices`.
  - `tools/scripts/proposals/sync-proposal-registry.script.ts`
    (modified — switches to the exporter from S1)
  - `tools/scripts/proposals/sync-proposal-counters.script.ts`
    (modified)
- **Gate**: lint
- acceptance:
  - All docs describe `INDEX.json` as a derived file, not a source
    of truth.
  - The two sync scripts use the SQLite exporter and never read
    from the JSON files.
  - A new doc section explains the four-phase migration: A
    (legacy + SQL shadow), B (SQL primary + legacy compare), C (SQL
    only + legacy export), D (SQL only, legacy removed).

## acceptance

- All S1-S4 slices land.
- The plugin can be restarted at any time; the SQLite DB is the only
  thing that needs to be present for the plugin to function.
- The audit invariant #11 ("los outputs legacy son derivados") is
  demonstrably satisfied.

## notes

- This proposal is intentionally heavy on docs because the cultural
  shift from "INDEX.json is the catalogue" to "INDEX.json is an export"
  is exactly the kind of change that bites six months later when a
  new agent reads the README and assumes the wrong direction.
- The legacy JSON files will remain on disk during the transition
  period; they will be regenerated on every write by the outbox
  processor. Deletion is `Phase D`, after a successful month of
  `mode: 'incremental'` running on SQLite only.