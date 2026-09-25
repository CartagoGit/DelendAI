---
id: x00651
title: "A proposal move leaves the shared index alone, and a repeated tombstone is the same fact"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-25
---

# x00651 — A proposal move leaves the shared index alone, and a repeated tombstone is the same fact

## Goal

Moving a proposal between status folders never stages anything in a shared checkout that persists work through work refs, and promoting a reconcile candidate never fails on a disappearance the active database already recorded.

## why

Seen on 2026-09-25 while delivering x00643–x00646. `proposal_transition` and the registry sync move files with `git mv` — and `git add` the destination when the source was untracked — so every transition in the shared checkout left a staged rename in `.git/index`, where the next agent's commit could sweep it in; under a `shared-*` profile the index belongs to nobody and the move reaches a ref through the WIP engine anyway. Separately, every `sync:proposals` on develop reports `the sqlite projection was NOT refreshed: UNIQUE constraint failed: tombstones.entity_type, tombstones.entity_uid, tombstones.deleted_at, tombstones.last_seen_commit`: the staging candidate carries the tombstones the active database already holds, and promotion re-inserts them with a plain INSERT, while the reconciler itself writes the same observation with INSERT OR IGNORE.

## non-goals

- Changing how a direct-commit profile stages moves: there the index is the agent's, and a rename it does not stage would commit only the deletion.
- Changing what a tombstone records or when one is written.

## Slices

- global_gate: e2e

### S1 — A move in a work-ref checkout touches no index
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/shared/index-free-git-runner.ts`, `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/index.ts`, `plugins/proposals/tests/src/lib/shared/index-free-git-runner.spec.ts`, `plugins/proposals/tests/src/lib/tools/proposal-transition-index.spec.ts`
- **Gate**: e2e
- acceptance:
  - "Under a development policy whose work persists through work refs, proposal_transition and the registry sync move the file with a plain rename and leave `git diff --cached` exactly as it was."
  - "Under a direct-commit policy, and with no policy at all, the move is staged as before."

### S2 — Promotion keeps one copy of each tombstone observation
- **Status**: pending
- **Files**: `packages/proposals-sqlite/src/lib/reconciler-apply-candidate.ts`, `packages/proposals-sqlite/tests/src/lib/reconciler-apply-candidate.spec.ts`
- **Gate**: e2e
- acceptance:
  - "Promoting a candidate that carries a tombstone the active database already holds succeeds and leaves exactly one row for that observation."
  - "`tombstonesApplied` counts only observations that were new to the active database."

## acceptance

- Under a development policy whose work persists through work refs, proposal_transition and the registry sync move the file with a plain rename and leave `git diff --cached` exactly as it was.
- Under a direct-commit policy, and with no policy at all, the move is staged as before.
- Promoting a candidate that carries a tombstone the active database already holds succeeds and leaves exactly one row for that observation.
- `tombstonesApplied` counts only observations that were new to the active database.
