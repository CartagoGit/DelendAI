---
id: x00920
title: "The remedy for a stray ref can be followed"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-18
last-transition-id: f4da0514-0d88-4113-a08b-c111548762d8
last-correlation-id: f4da0514-0d88-4113-a08b-c111548762d8
last-transition-from: ready
last-transition-at: 2026-10-18T17:20:41.210Z
---

# x00920 — The remedy for a stray ref can be followed

## goal

Every ref `no-stray-refs` names either goes by itself, because the forge already holds what it points at, or can be kept on the forge by the command the invariant's remedy names, so a clone can be brought back to a clean invariant without hand-made git.

## why

On 2026-10-18 the invariant named fourteen refs in this clone (`refs/remotes/ret/*`, `refs/remotes/prg14`, `refs/remotes/prg14b`). Its remedy reads "a tip worth keeping is retired (`delendai work retire --ref=<branch> --reason=<why>`) … then `git update-ref -d <ref>`", but:

- twelve were local copies of tips the forge already keeps under `refs/delendai/retired/…`, each the exact commit; nothing was lost by deleting them, yet the stray-ref reaper (`stray-refs-reap.service.ts`) removes only refs whose commits change no file, so they stayed until a person proved it by hand;
- the two others hold a commit the forge does not have, and `work retire --ref=refs/remotes/prg14` refuses: "is not a unit of work: it is under neither `heads/delendai/wip/` nor `delendai/pr/`". The command the remedy names cannot take the ref the remedy is about.

## non-goals

- Deciding whether a stray tip's content should land: keeping it is the remedy, landing it is its owner's call.

## slices

- global_gate: type

### S1 — A copy of what the forge holds is reaped

- **Status**: review
- **Files**: `packages/core/src/lib/work-units/stray-refs-reap.service.ts`, `packages/core/src/lib/work-units/stray-refs-reap.interface.ts`, `packages/core/src/lib/work-units/work-unit-reap.service.ts`, `packages/core/tests/src/lib/work-units/stray-refs-reap.service.spec.ts`
- **Gate**: type
- acceptance:
  - "The stray-ref reaper also removes a ref whose tip is the tip of a ref the forge holds, or is contained in one, and reports why; a ref holding a commit the forge lacks is still left. A spec holds both."
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — A stray tip is retired by the command the remedy names

- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/stray-ref-retire.service.ts`, `packages/core/src/lib/work-units/work-unit-retire.service.ts`, `packages/core/src/lib/work-units/stray-refs.service.ts`, `packages/core/tests/src/lib/work-units/stray-ref-retire.service.spec.ts`
- **Gate**: type
- acceptance:
  - "`work retire --ref=<a ref no-stray-refs names> --reason=<why>` keeps its tip on the forge under the retired namespace, for the retiring agent, then deletes the local ref; a ref inside a managed namespace other than work and publication is still refused. The invariant's remedy names exactly this. A spec holds the round trip."

## acceptance

- After `work retire` on each stray ref holding work, and the reaper on the rest, `no-stray-refs` holds, and every tip is on the forge.
