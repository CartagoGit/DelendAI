---
id: x00621
title: "Every writer of a proposal levels the database, not only the sync tool"
kind: fix
status: done
type: proposal
track: architecture
date: 2026-09-23
shipped-in:
  - "b0193719f"
  - "d55d0b8735a48dd76ccd87c32c7ee6ddcbacb423"
last-transition-id: 7313d02a-1a53-4bb3-b45d-5116d32d3c86
last-correlation-id: 7313d02a-1a53-4bb3-b45d-5116d32d3c86
last-transition-from: review
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
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Independiente: implementer claude-opus-5-5, reviewer minimax-3. Verifiqué d55d0b8735a48dd76ccd87c32c7ee6ddcbacb423 (merge de PR #363 — every writer of a proposal levels the database). Slice gate run verbatim: npx vitest run plugins/proposals/tests/src/lib/tools/sync-proposals-projection.spec.ts plugins/proposals/tests/src/lib/services/projection-refresh.spec.ts plugins/proposals/tests/src/lib/proposals/index-reader-parity.spec.ts = 21/21 tests pass, exit 0. Los 10 ficheros declarados existen en el árbol actual. Aceptación: (1) syncProposalRegistry escribe index.json y refresca SQLite dentro del mismo lock → projection-refresh.spec.ts cubre el orden; (2) la consulta al reader (decideIndexSource) determina cuándo refrescar — refreshes solo en divergence/unavailable/metadata-missing/parity-no-respuesta — index-reader-parity.spec.ts cubre los 4 casos; (3) una reconciliación rechazada devuelve failed con reason — sync-proposals-projection.spec.ts cubre los dos casos (con reason y sin reason); (4) el sync-tool y el script usan el resultado de la única acción en vez de refrescar por reglas separadas. Ningún cambio out-of-scope. PR #363 MERGED.
- review-attribution: claude-opus-5-5 from commit d55d0b8735a4 names refs/heads/delendai/wip/claude-opus-5-5/x00621-S1-g1/every-writer-levels-the-database (d55d0b8735a48dd76ccd87c32c7ee6ddcbacb423), opened by minimax-3
### S2 — Proved against a real database, through a transition

- **Status**: done
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
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Independiente: implementer claude-opus-5-5, reviewer minimax-3. Verifiqué b0193719f (merge de PR #363 — every writer of a proposal levels the database, segunda mitad). Slice gate run verbatim: bun test --timeout 30000 plugins/proposals/tests/src/lib/services/projection-follows-every-writer.spec.ts = 2/2 tests pass. Aceptación: (1) tras un sync, el reader responde parity y un segundo sync es skipped → primer test cubre este caso; (2) tras proposal_transition sin sync, el reader sigue parity y la DB tiene el nuevo status → segundo test cubre este caso. Ningún cambio out-of-scope.
- review-attribution: claude-opus-5-5 from commit b0193719f29c names refs/heads/delendai/wip/claude-opus-5-5/x00621-S1-g1/every-writer-levels-the-database (b0193719f29c12cead30d12298bca0a75301f949), opened by minimax-3
## acceptance

- A transition made over MCP leaves the reader serving SQLite, with the
  moved status, without a sync.
- A project whose index is current but whose database was never built
  gets one on its next write.
- A level database is not reconciled again.
- A rejected reconcile is never reported as a refresh.
