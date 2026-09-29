---
id: f00641
title: "The proposals database runs on Node as well as Bun"
kind: feat
status: in-progress
type: proposal
track: architecture
date: 2026-09-25
priority: P1
related: [q00022, r00043]
---

# f00641 — The proposals database runs on Node as well as Bun

## goal

A host that runs the server under Node can open, migrate, reconcile and
read the proposals database, exactly as a host under Bun can.

## why

The proposals database opened only through `bun:sqlite`. Under Node the
driver threw, so the proposal index was always served from the JSON
registry there, and q00022's phase 2 (SQLite as the default read source)
would have made every proposal read on a Node host fail. The product is
meant to work on either runtime. Node ships SQLite as `node:sqlite`
(`DatabaseSync`, Node 22.5+), so nothing needs to be installed.

## why this design

- One seam: `loadDatabaseClass` is the single place the database class is
  resolved. It keeps `bun:sqlite` first and falls back to an adapter over
  `node:sqlite`, so nothing that already runs under Bun changes.
- The adapter mirrors only the part of `bun:sqlite`'s `Database` the
  stack uses (measured: `exec`, `run`, `query`/`prepare` with
  `get`/`all`/`run`/`values`, `transaction` with its modes, `close`), and
  absorbs the differences: `get` answers `null`, a missing file with
  `create: false` refuses as `SQLITE_CANTOPEN` does, a nested transaction
  is a savepoint.

## non-goals

- Replacing `bun:sqlite` where it is available.
- Other databases (`state-telemetry`'s duration history has its own
  loader and is out of scope).

## architecture

- `packages/proposals-sqlite/src/lib/node-sqlite-database.helper.ts`:
  `NodeSqliteDatabase`.
- `packages/proposals-sqlite/src/lib/bun-sqlite.helper.ts`:
  `loadDatabaseClass` falls back to it.

## Slices

- global_gate: none

### S1 — An adapter over node:sqlite behind the one loader

- **Status**: review
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/proposals/proposals-db-on-node.spec.ts`
- **Files**: `packages/proposals-sqlite/src/lib/node-sqlite-database.helper.ts`,
  `packages/proposals-sqlite/src/lib/bun-sqlite.helper.ts`,
  `packages/proposals-sqlite/tests/src/lib/node-sqlite-database.helper.spec.ts`,
  `plugins/proposals/tests/src/lib/proposals/proposals-db-on-node.spec.ts`

Proven on Node (vitest): a fresh database applies every migration,
including 0020's table rebuild; this repository's proposals reconcile;
and the registry exported from that database equals the markdown scan.
The adapter's own behaviour is pinned in the bun suite (Bun also provides
`node:sqlite`).

### S2 — The default read source can be SQL on both runtimes

- **Status**: pending
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/proposals/index-reader.spec.ts`
- **Files**: `plugins/proposals/src/lib/contracts/constants/proposal-index-source.constant.ts`,
  `plugins/proposals/src/lib/proposals/index-reader.ts`

q00022 S4 phase 2: with the database readable on Node, moving
`DEFAULT_PROPOSAL_INDEX_SOURCE` from `auto` to `sql` no longer fails Node
hosts. It remains gated on the evidence q00022 names.

## dependency graph

S1 → S2. S2 is also q00022 S4 phase 2.

## acceptance

- On Node, `ProposalsSqliteDriver` opens and migrates a fresh database,
  and the proposals reconcile into it.
- The registry exported from that database equals the markdown scan.
- Under Bun nothing changes: `bun:sqlite` is still the one resolved.

## risks and mitigations

- **Behaviour differences between the two SQLite bindings.** The adapter
  spec pins each difference it absorbs; the Node spec runs the whole
  stack (migrations, reconcile, export) end to end on the real tree.

## notes

`node:sqlite` is present from Node 22.5; this machine runs Node 26.5.
