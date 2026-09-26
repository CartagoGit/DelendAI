---
id: x00550
title: "A work ref from another machine must not corrupt the state database"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-19
shipped-in:
    - f11745698031c422bb532f3947cca7642968da17
    - e005c176e7b8d0b12b98d0e108bf64b9bebd1870
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

- **Status**: done
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

- **Gate**: `bun test packages/proposals-sqlite/`
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Implementer unrecorded: independence cannot be verified; reviewed identically to a recorded delivery. Read the full commit f11745698 (message + stat; the diff carries migration 0019 +180 lines, migrations.ts runner change +35, schema.ts, driver spec line, and the two new spec files — all inside the declared Files). Verified against acceptance: (1) a work ref from another machine no longer corrupts the state database — 0019 recreates work_units/generations/work_unit_owners with the ref-parsed attribution as plain columns and WITHOUT the agents foreign key, and the runner (which previously ignored PRAGMA foreign_keys inside a transaction — SQLite's documented behaviour) now disables it around rebuilds-tables migrations and runs foreign_key_check inside the transaction; (2) claims and leases KEEP their REFERENCES agents(id) ON DELETE RESTRICT (grepped across 0015/0016/0020: owner_agent_id/created_by_agent_id FKs intact), so an unregistered agent's claim is still refused at the write; (3) ref-attribution.spec.ts + migration-checksums.spec.ts pass under bun test: 10/10 exit 0 (these are bun-owned bun:sqlite specs, run in the correct zone); (4) this repository's own startup reaches READY again — work status operates normally against the state DB in this session (anchored yes, no corrupt-db DEGRADED finding). bun run typecheck exit 0 globally. No out-of-scope changes.
- review-attribution: unrecorded — nothing in Git names who delivered f11745698031c422bb532f3947cca7642968da17: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
### S2 — The state connection enforces what the schema says

- **Status**: done
  the same pragmas every other connection to this database uses, so the
  connection the startup reconciler writes through enforces foreign keys,
  uses WAL and waits on a busy database. A generation attributed to a
  machine nobody registered is now refused at the write; with the pragmas
  removed again, that spec fails — which is exactly how the rows that
  blocked this repository got in.
- **Files**: [`packages/proposals-sqlite/src/lib/work-model/startup-state-ports.ts`, `packages/proposals-sqlite/tests/src/lib/work-model/startup-state-ports.spec.ts`]

- **Gate**: `bun test packages/proposals-sqlite/tests/src/lib/work-model/startup-state-ports.spec.ts`
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Implementer unrecorded: independence cannot be verified; reviewed identically to a recorded delivery. Same commit f11745698 as S1, message read. Verified in the current tree: (1) startup-state-ports.ts:116 applies SQLITE_BOOT_PRAGMAS (imported from schema.ts, line 29) to every startup state connection via openStartupStatePorts — foreign keys are now enforced by the connection that writes the rows, which is what makes S1's removal of the attribution FK meaningful (refusals happen at the write, not at a later integrity scan); (2) startup-state-ports.spec.ts passes under bun test: 3/3, 0 fail (bun-owned bun:sqlite zone); (3) acceptance item 2 ('a claim or lease by an unregistered agent is still refused, at the write') is enforced by this slice's pragmas plus the retained REFERENCES agents(id) in claims/leases tables (verified by grep across migrations 0015/0016/0020 during the S1 review); (4) this repository's startup reaches READY — the state-backed work tools functioned normally throughout this session. bun run typecheck exit 0. No out-of-scope changes.
- review-attribution: unrecorded — nothing in Git names who delivered f11745698031c422bb532f3947cca7642968da17: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
## acceptance

- A database holding work units attributed to an agent that was never
  registered locally opens, passes its integrity check, and does not block
  mutations.
- A claim or lease by an unregistered agent is still refused, at the write.
- The repository's own startup reaches READY again.
