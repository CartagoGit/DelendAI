---
id: x00985
title: "A unit whose owner is committing is never reaped as silent"
kind: fix
status: ready
type: proposal
track: swarm-hardening
date: 2026-10-27
---

# x00985 — A unit whose owner is committing is never reaped as silent

## goal

A unit is retired as silent only when its owner has stopped working on it: commits made in its worktree count as its heartbeat on the forge, as the work model already promises ("every work command and commit is its heartbeat").

## why

CI's `ref-lifecycle --reap` (`tools/scripts/lint/ref-lifecycle-guard.script.ts`, `silentWorkRefs`) retires an unpublished work ref once the committer date of its tip on the forge is older than the lease window (30 min). The unit's lease and heartbeat live in the local git common directory (`unit-lease.store.ts`), which CI cannot see, and commits made in a worktree reach the forge only at the next checkpoint, merge or publish.

So an owner working in its unit for more than half an hour, committing locally, is reaped. On 2026-10-27 this retired four live units of one session: r00645 g1 and g2, x00972 g1 and x00974 g1. x00974 had eleven local commits over about ninety minutes when its ref went to `refs/delendai/retired/…`, and the worktree was removed. Each was recovered by entering a new generation and merging the retired tip; one gate run was lost each time, and a delegated agent paused by its quota is reaped the same way.

## non-goals

- The reap window itself, or reaping refs whose owner really left.

## slices

- global_gate: type

### S1 — A commit in a unit reaches the forge as its heartbeat
- **Status**: pending
- **Files**: `lefthook.yml`, `tools/scripts/hooks/unit-heartbeat.script.ts`, `packages/core/src/lib/wip-engine/work-ref-heartbeat.service.ts`
- **Gate**: type
- acceptance:
  - "A commit made in a unit's worktree pushes that unit's work ref to the forge in the background, without blocking the commit and without failing it when the push fails; a commit in the shared checkout or on any other branch pushes nothing."
  - "A unit whose owner committed within the lease window is not listed by silentWorkRefs, shown by a spec over a ref whose forge tip is that commit."

## acceptance

- A commit made in a unit's worktree pushes that unit's work ref to the forge in the background, without blocking the commit and without failing it when the push fails; a commit in the shared checkout or on any other branch pushes nothing.
- A unit whose owner committed within the lease window is not listed by silentWorkRefs, shown by a spec over a ref whose forge tip is that commit.

## notes

- The push is the wip ref only (`delendai/wip/<agent>/…`), never `develop` or a `pr/` ref, and goes through the same refspec `work checkpoint` uses, so the forge sees exactly what a checkpoint would publish.
