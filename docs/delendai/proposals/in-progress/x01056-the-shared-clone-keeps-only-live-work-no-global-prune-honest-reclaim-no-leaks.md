---
id: x01056
title: "The shared clone keeps only live work: no global prune, honest reclaim, no leaks"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-08
last-transition-id: 68c741b0-088d-4909-8b70-647fb9a8fef8
last-correlation-id: 68c741b0-088d-4909-8b70-647fb9a8fef8
last-transition-from: ready
last-transition-at: 2026-11-08T22:12:36.451Z
---

# x01056 — The shared clone keeps only live work: no global prune, honest reclaim, no leaks

## goal

Certification, proof and publish stop running a global git worktree prune; the reclaimer classifies runtime, detached-contained and delivered worktrees honestly; refresh-candidate-artifacts and the train rehearsal leak no worktree or local branch.

## why

An inventory of the shared clone found worktrees and refs that belong to nobody. A global `git worktree prune` in the certification, the proof and the publish pre-flight drops other units' registrations mid-operation (the rescued minimax-prune fix, commit 86010b333, never landed). The reclaimer calls the `--branch`/`--version` runtime worktrees other projects run from "spent", calls detached contained worktrees "undelivered" and cannot tell a live proof worktree from a dead one. `refresh-candidate-artifacts` and the train rehearsal leak scratch worktrees and local `delendai/train/*` branches, and the owner does not want machine refs in local clones.

## non-goals

- Reclaiming worktrees that hold uncommitted or undelivered work, except a merge whose both parents are on the remote.
- Changing what the train rehearsal gates check.

## slices

- global_gate: none

### S1 — No global prune, honest reclaim, no leaks
- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/local-certification.service.ts`, `packages/core/src/lib/work-units/work-unit-proof.service.ts`, `tools/scripts/forge/publish-candidate.script.ts`, `tools/scripts/forge/publish-candidate.script.spec.ts`, `packages/core/tests/src/lib/work-units/local-certification.service.e2e.spec.ts`, `packages/core/tests/src/lib/work-units/work-unit-proof.service.spec.ts`, `tools/scripts/reclaim/reclaim-worktrees.script.ts`, `tools/scripts/reclaim/reclaim-worktrees.interface.ts`, `tools/scripts/reclaim/reclaim-worktrees.script.spec.ts`, `tools/scripts/git/refresh-candidate-artifacts.script.ts`, `tools/scripts/git/refresh-candidate-artifacts.script.spec.ts`, `tools/scripts/forge/train-rehearsal.script.ts`, `tools/scripts/forge/train-rehearsal.spec.ts`
- **Gate**: none

## acceptance

- No code path runs a global `git worktree prune` while it holds a unit's worktree; each removes only its own.
- The reclaimer classifies branch-runtime worktrees as runtime (never reclaimed), detached clean worktrees contained in a remote ref as spent, `.git/delendai-prove/*` by whether a live process holds it, and a merge in progress whose HEAD and MERGE_HEAD are both on the remote as spent.
- `refresh-candidate-artifacts` removes its `/tmp/candidate-refresh-*` worktree in a `finally`; the train rehearsal creates no local branch.
- Work refs with no unique commits are retired with `delendai work retire`.

## notes

- The work ref `delendai/wip/claude-sonnet-5-5/implement/f00799-S4-g2/orchestrator-cost` is gaining commits with no lease, so its writer must be found. It is left as it is: it was not retired.
