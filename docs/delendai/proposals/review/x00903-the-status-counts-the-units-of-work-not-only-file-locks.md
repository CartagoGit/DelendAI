---
id: x00903
title: "The status counts the units of work, not only file locks"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-14
last-transition-id: 0d5e0175-3848-43a1-9ae8-1e4217581c4e
last-correlation-id: 0d5e0175-3848-43a1-9ae8-1e4217581c4e
last-transition-from: in-progress
last-transition-at: 2026-10-14T19:55:22.993Z
---

# x00903 — The status counts the units of work, not only file locks

## goal

`delendai proposals status` (and the `compact_status` tool behind it) shows how many units of work exist and in what standing, next to the file locks, so a swarm working in worktrees reads as working.

## why

The owner, 2026-10-14, with a dozen agents reviewing and implementing at once: `proposals status` printed `"locks": { "active": 0 }`, and asked why there were no locks when every agent had locked its part.

`locks.active` counts the in-flight entries of the task queue's lock file. Under a worktree work model an agent takes no file lock: it holds its work through a unit (a work ref and its worktree, with a lease) and a reviewer through a claim. The status counted only the mechanism nobody was using, so a busy swarm looked idle. The verdict on every unit already existed (`readUnitStandings`, the same reader the reaper and the claim liveness use); the status did not ask it.

## non-goals

- Retiring the task-queue file locks: projects that coordinate through them still read `locks`.
- Listing the units: `delendai work swarm` lists them; the status stays a few bytes.

## slices

- global_gate: type

### S1 — `compact_status` reports units by standing

- **Status**: review
- **Files**:
  - `plugins/proposals/src/lib/tools/compact-status.tool.ts`
  - `plugins/proposals/src/index.ts`
  - `packages/core/src/cli.ts`
  - `plugins/proposals/src/generated/tool-outputs.ts`
  - `plugins/proposals/tests/src/lib/tools/compact-status-units.spec.ts`
  - `docs/delendai/TOKEN-BUDGETS.md`
  - `packages/core/src/lib/contracts/constants/preset-metadata.generated.ts`
- **Gate**: type
- acceptance:
  - With a development policy, the status has `units`, the one line the work surfaces already print (`N live, N idle, N abandoned, N delivered`), counted by the reader the reaper uses over the work refs of this clone and its remotes.
  - Without a policy, or when `fields` leaves `units` out, there is no `units` field.
  - The tool's description says that `locks` are task-queue file locks and that worktree units take none.
  - The proposals plugin stays under its hard token budget: `units` is one string, not an object, in the output schema.
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `2f47d9f777b6`

## acceptance

- In this repository, with agents at work, `proposals status` shows their units while `locks.active` is 0.
