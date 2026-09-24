---
id: x00621
title: "Every writer of a proposal levels the database, not only the sync tool"
kind: fix
status: review
type: proposal
track: architecture
date: 2026-09-23
shipped-in: ["b0193719f"]
---

# x00621 — Every writer of a proposal levels the database, not only the sync tool

## goal

The proposal store has one source (the markdown) and two projections of
it: the registry `index.json` and the SQLite database the reader
prefers. Any act that changes a proposal must leave both projections
level, in every project, without anyone running a sync by hand. That is
the precondition for SQLite ever becoming the authority, which is where
the store is heading.

## why

Measured, not reasoned about.

- Seven tools change proposals (transition, create, close a slice,
  adopt, incident, inherited instructions, sync). All of them rebuild the
  registry through one function, `syncProposalRegistry`. Only two places
  rebuilt the database: the `sync_proposals` tool and this repository's
  pre-commit script. A `proposal_transition` over MCP left the reader
  answering `divergence` and serving JSON until the next commit. In a
  consumer project with no such hook it served JSON until someone synced
  by hand. The new spec reproduces it: with the transition's refresh
  disconnected, the reader answers `divergence` right after the move.
- The two places that did refresh used two different rules. The tool
  refreshed when the registry had changed; the script refreshed whenever
  there were no errors. The tool's rule has a hole: an index that is
  already current (a project upgraded from a version that never built
  the database, or one whose first refresh failed) never changes, so the
  database was never built and the reader fell back for good.
- `reconcileProjection` reported `refreshed` for any reconcile that did
  not throw, including one that returned `status: 'rejected'`. A
  projection the reader would keep rejecting was announced as level.
- A full reconcile costs about 3.6 s on this repository whether or not
  anything changed; it is not incremental. So running it on every write
  unconditionally is not an option.

## why this design

The refresh moves into the one function every writer already calls.
`syncProposalRegistry` writes the registry and then levels the database,
inside the same index lock, so both views come from the same tree. No
writer can skip it, and the two call sites that refreshed separately now
report what the one act did instead of doing it again.

"Level" is not a new rule. `projectionParity` (in `index-reader-parity.ts`) asks the reader's own
verdict (`decideIndexSource`) without serving anything, recording a read,
or emitting a notice. The writer refreshes exactly when the reader would
otherwise fall back: `divergence`, `unavailable`, `metadata-missing`, or
a parity question that could not be answered. A level projection costs a
pair of reads, not a reconcile.

A refresh failure still never fails the write. The registry is written
first and is correct on its own; a stale database is a cache the reader
falls back from, and the failure is reported with the reconciler's own
reason.

## non-goals

- Making SQLite the authority. This makes it trustworthy enough to become
  one; the cutover is the plan's later phases.
- Making the reconciler incremental. It would make each refresh cheaper;
  asking before refreshing makes most of them unnecessary.

## Slices

- global_gate: none

### S1 — The one act levels both projections, by the reader's verdict

- **Status**: done
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/sync-proposals-projection.spec.ts plugins/proposals/tests/src/lib/services/projection-refresh.spec.ts plugins/proposals/tests/src/lib/proposals/index-reader-parity.spec.ts`
- **Files**: `plugins/proposals/src/lib/proposals/index-reader.ts`,
  `plugins/proposals/src/lib/proposals/index-reader-parity.ts`,
  `plugins/proposals/src/lib/proposals/sync-proposal-registry.ts`,
  `plugins/proposals/src/lib/services/projection-refresh.ts`,
  `plugins/proposals/src/lib/tools/sync-proposals.tool.ts`,
  `tools/scripts/proposals/sync-proposal-registry.script.ts`,
  `plugins/proposals/tests/src/lib/tools/sync-proposals-projection.spec.ts`,
  `plugins/proposals/tests/src/lib/services/projection-refresh.spec.ts`,
  `plugins/proposals/tests/src/lib/proposals/index-reader.spec.ts`,
  `plugins/proposals/tests/src/lib/proposals/index-reader-parity.spec.ts`
- `syncProposalRegistry` levels the database after writing the registry
  and returns what it did as `projection`. The sync tool and the commit
  script report that result instead of refreshing on their own rules.
- A rejected reconcile is reported as `failed`, with its reason.

### S2 — Proved against a real database, through a transition

- **Status**: done — the spec was proved to be a tripwire. With only the
  transition's refresh disconnected, the transition case fails with the
  reader answering `divergence`; with the refresh connected both cases pass.
- **Gate**: `bun test --timeout 30000 plugins/proposals/tests/src/lib/services/projection-follows-every-writer.spec.ts`
- **Files**: `plugins/proposals/tests/src/lib/services/projection-follows-every-writer.spec.ts`,
  `plugins/proposals/vitest.config.ts`,
  `package.json`
- A real repository, the real reconciler, and the real reader. After a
  sync the reader answers `parity` and a second sync is `skipped`. After a
  `proposal_transition`, with no sync, the reader still answers `parity`
  and the database holds the new status.

## acceptance

- A transition made over MCP leaves the reader serving SQLite, with the
  moved status, without a sync.
- A project whose index is current but whose database was never built
  gets one on its next write.
- A level database is not reconciled again.
- A rejected reconcile is never reported as a refresh.
