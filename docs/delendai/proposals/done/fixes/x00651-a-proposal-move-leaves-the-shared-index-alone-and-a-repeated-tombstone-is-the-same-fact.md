---
id: x00651
title: "A proposal move leaves the shared index alone, and a repeated tombstone is the same fact"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-25
last-transition-id: f3a28b0b-a1c3-4e86-8d74-925793f139ee
last-correlation-id: f3a28b0b-a1c3-4e86-8d74-925793f139ee
last-transition-from: in-progress
shipped-in:
  - "9ed67d1ddc316d1d6c66e2e4a3b959f57e87eca2"
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
- **Status**: done
- **Files**: `plugins/proposals/src/lib/shared/index-free-git-runner.ts`, `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/index.ts`, `plugins/proposals/tests/src/lib/shared/index-free-git-runner.spec.ts`, `plugins/proposals/tests/src/lib/tools/proposal-transition-index.spec.ts`
- **Gate**: e2e
- acceptance:
  - "Under a development policy whose work persists through work refs, proposal_transition and the registry sync move the file with a plain rename and leave `git diff --cached` exactly as it was."
  - "Under a direct-commit policy, and with no policy at all, the move is staged as before."
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: glm-5.3-max
- review-log: approved by glm-5.3-max — Revisé la entrega real 9ed67d1dd. Bajo política work-ref, proposal_transition y el registry sync mueven el fichero con rename plano vía index-free-git-runner y dejan git diff --cached EXACTO como estaba (el índice compartido no se toca); bajo direct-commit o sin política, el movimiento se stagea como antes (compatibilidad). En proposals-sqlite: promover un candidato con un tombstone que la BD activa ya tiene tiene éxito y deja UNA sola fila por observación; tombstonesApplied cuenta solo las observaciones nuevas. Acceptance cubierta — reconciler-apply-candidate.spec +46, index-free-git-runner.spec 85, proposal-transition-index.spec 102; gate 8/8 en lote. Sin cambios fuera de alcance.
### S2 — Promotion keeps one copy of each tombstone observation
- **Status**: review — shipped in #462 (merge 9ed67d1dd)
- **Files**: `packages/proposals-sqlite/src/lib/reconciler-apply-candidate.ts`, `packages/proposals-sqlite/tests/src/lib/reconciler-apply-candidate.spec.ts`
- **Gate**: e2e
- acceptance:
  - "Promoting a candidate that carries a tombstone the active database already holds succeeds and leaves exactly one row for that observation."
  - "`tombstonesApplied` counts only observations that were new to the active database."
- review-state: in_review
- review-implementer: claude-opus-5-5
## acceptance

- Under a development policy whose work persists through work refs, proposal_transition and the registry sync move the file with a plain rename and leave `git diff --cached` exactly as it was.
- Under a direct-commit policy, and with no policy at all, the move is staged as before.
- Promoting a candidate that carries a tombstone the active database already holds succeeds and leaves exactly one row for that observation.
- `tombstonesApplied` counts only observations that were new to the active database.
