---
id: x00550
title: "A work ref from another machine must not corrupt the state database"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-19
tags:
    - sqlite
    - work-model
    - agents
    - startup
---

# x00550 — A work ref from another machine must not corrupt the state database

## goal

The state database of a project that has ever seen a work ref written
elsewhere opens, passes its integrity check and allows mutations. A write
that really is invalid fails where it is made, not days later at someone
else's startup.

## why

Observed on 2026-09-19 in this repository, live:

```
[ERROR] startup-reconciliation: DEGRADED (mode=skipped, blockers=1)
[ERROR] startup-reconciliation.state-database.corrupt: …/proposals.sqlite:
  Integrity check failed: foreign key violation in generations (row 1)
  referencing agents; … in work_units (row 1) …; in work_unit_owners (row 1) …
[delendai] Mutations blocked: true | recovery required: true
```

The rows are delendai's own:

- `agents` holds one row, `host@DelendAI`, registered by the startup
  reconciler from the boot environment.
- `work_units`, `generations` and `work_unit_owners` hold
  `agent_id = 'DESKTOP-9CTQRS7'`, the agent component parsed out of the ref
  `refs/wip/DESKTOP-9CTQRS7/x00545-S1-g1` by `rebuild-work-units`.

Two defects produced that:

1. **Attribution parsed from a ref is not a local agent.** The schema
   requires `work_units.created_by_agent_id`, `work_units.current_owner_agent_id`,
   `work_unit_owners.agent_id` and `generations.author_agent_id` to exist in
   `agents`, but a work ref may have been written by another machine, another
   host, or this machine before it registered anything. The rebuild writes the
   attribution it read, which is the right value and an agent row that does not
   exist.
2. **The connection that writes them enforces no foreign keys.**
   `openStartupStatePorts` opens the database with `new Database(...)` and
   never applies `SQLITE_BOOT_PRAGMAS`, so `foreign_keys` is OFF — SQLite
   accepts the row. The proposals driver applies them; this path does not. The
   violation surfaces later as "the state database is corrupt", blocks every
   mutation, and names a file nobody edited.

## non-goals

- **No weakening of local facts.** `claims.owner_agent_id` and
  `leases.owner_agent_id` are this machine's own claims; they keep their
  foreign key.
- **No data deletion.** Existing rows keep their attribution; nothing is
  rebuilt or dropped to make the check pass.

## slices

### S1 — Attribution columns hold what the ref said; only local facts reference `agents`

- **Status**: done — migration 0019 recreates `work_units`,
  `work_unit_owners` and `generations` with the same columns, checks,
  indexes and rows, and without the foreign key from their attribution
  columns to `agents`; the columns stay `NOT NULL`. `claims` and `leases`
  keep theirs, so an unregistered agent still cannot claim or lease.
  SQLite cannot drop a foreign key in place and ignores
  `PRAGMA foreign_keys` inside a transaction, so the runner now recognises
  a migration marked `-- delendai:rebuilds-tables`: it disables foreign
  keys around that migration's transaction and runs `foreign_key_check`
  inside it, so a rebuild that broke a reference rolls back instead of
  committing a damaged database. Proven against a database built at
  version 18 carrying the exact row this repository had, and against a
  copy of this repository's own database: it migrates, keeps its rows and
  passes the integrity check.
- **Files**: [`packages/proposals-sqlite/src/lib/migrations/0019_ref_attribution_is_not_a_local_agent.sql`, `packages/proposals-sqlite/src/lib/migrations.ts`, `packages/proposals-sqlite/src/lib/schema.ts`, `packages/proposals-sqlite/src/lib/sqlite-driver.spec.ts`, `packages/proposals-sqlite/tests/src/lib/migration-checksums.spec.ts`, `packages/proposals-sqlite/tests/src/lib/work-model/ref-attribution.spec.ts`]

A migration recreates `work_units`, `work_unit_owners` and `generations`
with the same columns, checks, indexes and data, minus the foreign key from
their attribution columns to `agents`. The columns stay `NOT NULL`: the
value is required, the local agent row is not.

- **Gate**: `bun test packages/proposals-sqlite/`

### S2 — The state connection enforces what the schema says

- **Status**: done — `openStartupStatePorts` applies `SQLITE_BOOT_PRAGMAS`,
  the same pragmas every other connection to this database uses, so the
  connection the startup reconciler writes through enforces foreign keys,
  uses WAL and waits on a busy database. A generation attributed to a
  machine nobody registered is now refused at the write; with the pragmas
  removed again, that spec fails — which is exactly how the rows that
  blocked this repository got in.
- **Files**: [`packages/proposals-sqlite/src/lib/work-model/startup-state-ports.ts`, `packages/proposals-sqlite/tests/src/lib/work-model/startup-state-ports.spec.ts`]

`openStartupStatePorts` applies `SQLITE_BOOT_PRAGMAS`, so the connection the
startup reconciler writes through enforces foreign keys, uses WAL and waits
on a busy database like every other connection. A write that violates a
foreign key then fails at the write.

- **Gate**: `bun test packages/proposals-sqlite/tests/src/lib/work-model/startup-state-ports.spec.ts`

## acceptance

- A database holding work units attributed to an agent that was never
  registered locally opens, passes its integrity check, and does not block
  mutations.
- A claim or lease by an unregistered agent is still refused, at the write.
- The repository's own startup reaches READY again.
