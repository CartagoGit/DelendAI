---
id: q00025
title: "Implementation plan — P0 + P1 cutover (read-not-write, idempotent, atomic, observable)"
kind: plan
status: ready
type: proposal
track: architecture
date: 2026-09-07
priority: P0
audit-source:
  file: docs/delendai/audits/2026-09-07-develop-external-audit.md
  finding: AUD-CUTOVER-042
  snapshot: 91bbbff76ce35452c8c8b6e3bf2129a490bf7c94
related:
  - x00510
  - q00022
  - q00023
  - q00024
  - r00047
  - r00048
  - f00514
  - f00515
  - r00049
  - f00516
  - f00517
  - c00528
  - f00518
  - f00519
  - a00094
---

# q00025 — Implementation plan: P0 + P1 cutover

## Goal

Sequence the proposals created from the external audit into a single
executable roll-out. Every dependency between proposals is recorded in
the `related:` field of each proposal; this plan is the canonical
"do them in this order" reference for any agent that picks up the
cutover. The plan does not introduce new code; it is the integration
contract that makes the cutover non-fragile.

## Why

The audit delivered 16 distinct findings (P0 and P1). The user wants
all of them addressed. Producing proposals in isolation creates the
risk that two agents pick up overlapping slices and step on each
other. This plan sequences them by dependency:

- `q00022` (proposals SQLite schema) is the foundation.
- `r00048` (CAS revision) is the storage-layer concurrency primitive
  that `r00047` (idempotent lifecycle) consumes.
- `f00514` (lifecycle_events + outbox) is the storage-layer
  audit primitive that `r00049` (INDEX.json derived view) consumes.
- `f00515` (quarantine) and `f00519` (tombstones) extend the
  reconciler; both depend on `q00022`.
- `q00023` (SHA-pinned reconcile) and `q00024` (atomic reconcile)
  depend on `q00022`.
- `r00049` (INDEX.json derived view) depends on `q00022` + `f00514`.
- `f00516` (FTS5) and `f00517` (context compiler) depend on `q00022`.
- `c00528` (branch protection) is independent of all of the above
  but the CI changes reference the rebuild-digest job from
  `a00094`.
- `f00518` (db doctor / rebuild / verify / diff / conflicts) depends
  on `q00022`, `f00515`, `f00519`.
- `a00094` (audit acceptance — digest rebuild) depends on `q00022`,
  `q00023`, `q00024`.
- `x00510` (READ ≠ WRITE + validate-gate repair) is the P0 entry
  point; it must land first because it unblocks the validate gate
  for every other proposal.

## Why this design

**One cutover, four phases.** This plan formalises the audit's
four-phase migration (A → B → C → D):

- **Phase A — Read paths stay legacy; write paths emit shadow SQL.**
  Already partially complete. The current proposals plugin still
  reads from `INDEX.json`; this phase closes when every read path
  reads from `q00022`'s DB.
- **Phase B — SQL is the primary; legacy indexes are compared.**
  `r00049` S1+S2 lands; the outbox regenerates the legacy JSON;
  `db doctor` (f00518) cross-checks them.
- **Phase C — SQL is the only read path; legacy is exported on
  demand.** `r00049` S3 lands; the JSON files are removed from the
  read path entirely.
- **Phase D — Legacy files removed.** `r00049` S4 lands; the JSON
  files are deleted and the README documents SQL as canonical.

Each phase ends with a green `bun run validate` and the canonical
audit acceptance (`a00094`) passes.

**No mid-phase breakage.** Each phase is reviewable as a unit. No
slice straddles a phase boundary. Agents that join mid-cutover see a
green validate at every commit.

## non-goals

- Do NOT change the order described here without an explicit
  force-transition + a written reason in `proposal_transition`.
- Do NOT add new proposals mid-cutover without first checking they
  fit the dependency graph.

## Slices

- global_gate: lint

### S1 — Phase A entry: `x00510` lands first

- **Status**: pending
- **Files**: as listed in `x00510`
- **Gate**: type
- acceptance:
  - `x00510 S1` (typecheck repair) is committed.
  - `x00510 S2` (biome baseline) is committed.
  - `x00510 S3` (`IProposalMaterializer` boundary +
    `proposals_db_status`) is committed.
  - `x00506` can finally close.
  - `bun run validate` is green after every commit.

### S2 — Phase A foundation: `q00022 S1` (proposals-sqlite package skeleton + schema)

- **Status**: pending
- **Files**: as listed in `q00022 S1`
- **Gate**: type
- acceptance:
  - `packages/proposals-sqlite` package is created.
  - Schema migrations 0001..0005 land.
  - `bun run typecheck` green.

### S3 — Phase A reconciler: `q00022 S2` (parse + reconcile + quarantine)

- **Status**: pending
- **Files**: as listed in `q00022 S2`
- **Gate**: type
- acceptance:
  - Reconciler parses markdown, inserts / updates / quarantines.
  - `f00515 S1` (quarantine table + repo) lands.
  - The parity test (active ↔ shadow) passes.

### S4 — Phase B: `q00022 S3` (repository + lifecycle + outbox) + `q00022 S4` (wire plugin)

- **Status**: pending
- **Files**: as listed in `q00022 S3` + `S4`
- **Gate**: type
- acceptance:
  - Every read path in the plugin goes through the repository.
  - Every write path in the plugin goes through the repository.
  - `r00048 S1+S2` (CAS primitive) lands and is consumed by the
    repository.
  - `r00047 S1+S2` (idempotent lifecycle verbs) lands.

### S5 — Phase B SHA pin + atomic: `q00023` + `q00024` + `a00094 S1`

- **Status**: pending
- **Files**: as listed in `q00023`, `q00024`, `a00094 S1`
- **Gate**: e2e
- acceptance:
  - `reconcile --sha <sha>` is deterministic.
  - `mode: 'shadow'` + `promoteStaging()` round-trip works.
  - The digest rebuild test passes 100×.

### S6 — Phase B outbox + INDEX.json derived: `f00514 S1+S2` + `r00049 S1+S2` + `f00515 S2`

- **Status**: pending
- **Files**: as listed in `f00514 S1+S2`, `r00049 S1+S2`,
  `f00515 S2`
- **Gate**: type
- acceptance:
  - `lifecycle_events` and `outbox` tables exist.
  - Every write emits an outbox row.
  - `delendai export legacy-indices` regenerates the JSON.
  - All read paths go through SQLite.

### S7 — Phase B doctor + tombstones: `f00518 S1` + `f00519 S1`

- **Status**: pending
- **Files**: as listed
- **Gate**: type
- acceptance:
  - `db doctor` is wired.
  - Tombstone columns + `path_history` exist.

### S8 — Phase B CI protection + property test: `a00094 S2+S3` + `c00528`

- **Status**: pending
- **Files**: as listed
- **Gate**: lint
- acceptance:
  - Property-based digest test passes.
  - Branch protection references the rebuild-digest job.

### S9 — Phase C: `f00514 S3` (outbox processor) + `r00049 S3` (outbox-driven regen)

- **Status**: pending
- **Files**: as listed
- **Gate**: e2e
- acceptance:
  - The outbox processor drains pending rows.
  - Every entity write regenerates the JSON asynchronously.
  - The plugin never writes the JSON inline.

### S10 — Phase C doctor + rebuild: `f00518 S2+S3`

- **Status**: pending
- **Files**: as listed
- **Gate**: type
- acceptance:
  - `db rebuild --apply --confirm <sha>` round-trip works.
  - `db verify`, `db diff`, `conflicts` tools are wired.

### S11 — Phase C FTS + context compiler: `f00516` + `f00517`

- **Status**: pending
- **Files**: as listed
- **Gate**: type
- acceptance:
  - FTS5 is the canonical search backend.
  - `compile_context` returns L0-L5 bands.
  - Token telemetry is wired.

### S12 — Phase D legacy removal: `r00049 S4` + docs update

- **Status**: pending
- **Files**: as listed
- **Gate**: lint
- acceptance:
  - `INDEX.json` files are removed from the read path.
  - The README and the bootstrap describe SQL as canonical.
  - `delendai reconcile` is the single source of operational truth.

## acceptance

- All S1-S12 slices land.
- `bun run validate` is green at every slice boundary.
- The audit acceptance (`a00094`) passes 100× deterministically.
- The user-reported "propuestas que no es capaz de cerrar" is no
  longer reproducible.

## notes

- The phases are not strict: a phase can complete when its
  acceptance criteria are met, even if the next phase's
  preconditions are not yet in. The plan is a guideline; the
  actual ordering is enforced by the `related:` field of each
  proposal.
- This plan is itself a proposal; it is closed when the last phase
  lands.