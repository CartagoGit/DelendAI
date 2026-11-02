---
id: x00948
title: "Ref maintenance deletes only what it proved delivered, at the tip it proved it on"
kind: fix
status: done
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 1f0a3067-1fa0-4647-b94b-f95d4785ea45
last-correlation-id: 1f0a3067-1fa0-4647-b94b-f95d4785ea45
last-transition-from: review
last-transition-at: 2026-10-24T21:23:21.561Z
shipped-in:
  - "05f104c9e5263139f667c391e0ac765e02ff27a2"
---

# x00948 — Ref maintenance deletes only what it proved delivered, at the tip it proved it on

## goal

Every path that removes a branch, worktree or lock (reclaim, namespace maintenance, cleanup, preflight, the start-up mutex) deletes with a compare-and-swap on the tip it classified, treats a failed probe as 'keep', reports the forge's refusal as a failure, and never removes another invocation's worktree.

## why

Joint audit a00095 and gpt-6.1-sol's contribution. RECLAIM-01: a failed eligibility probe becomes 'zero ahead' and permits deleting unique work. RECLAIM-02: reclamation deletes a branch that advanced after it was classified safe. MAINT-01: a colliding preflight removes the other invocation's worktree after its own add fails. MAINT-02: namespace maintenance can classify one remote's tip and delete a different remote's branch. MAINT-03: two initial maintenance contenders can both acquire the lease after observing absence. MAINT-04: cleanup reports success after the forge refuses the deletion. ORCH-03 (P1): the start-up mutex steals a live lock after its TTL and the release deletes the new owner. G158: reclaim-worktrees classifies AGENT-BOOTSTRAP.md as generated, so uncommitted work there is discarded. G63: when a work ref lands it is deleted and the agent loses its visible branch.

## non-goals

- The queue's certification (the certification proposal).
- The proposals plugin's own GC (x00943 S3).

## slices

- global_gate: type

### S1 — Reclaim keeps on doubt and deletes by compare-and-swap
- **Status**: done
- **Files**: `tools/scripts/reclaim/reclaim-orphans.script.ts`, `tools/scripts/reclaim/reclaim-worktrees.script.ts`, `packages/core/src/lib/work-units/unit-reaper.service.ts`, `packages/core/src/lib/work-units/unit-removal.service.ts`
- **Gate**: type
- acceptance:
  - "A probe that fails classifies the branch as unknown and keeps it (RECLAIM-01)."
  - "Deletion uses `git push --force-with-lease=<ref>:<classified sha>` or update-ref with the old value; a branch that advanced after classification survives (RECLAIM-02)."
  - "AGENT-BOOTSTRAP.md and the other hand-written files are never classified generated (G158)."
- shipped-in: `debe2138eece`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: claude-sonnet-5-5
- review-log: approved by claude-sonnet-5-5 — verified at 05f104c9e526, validate exit 0 and tests 135/135 claimed, no recorded run cited; acceptance 3/3: (1) reclaim-orphans.spec 'keeps a branch whose count could not be read' passes (2) reclaim specs 'deletes only at the tip it was classified at' and unit-removal 'keeps a branch that moved on after it was judged' pass (3) reclaim spec 'counts an edit to the hand-written bootstrap as work' passes — verified by code reading and spec runs

### S2 — Namespace maintenance, preflight and the lease
- **Status**: done
- **Files**: `tools/scripts/git/maintain-ref-namespace.script.ts`, `tools/scripts/forge/publish-candidate.script.ts`, `packages/core/src/lib/development-policy/maintenance-lease.service.ts`
- **Gate**: type
- acceptance:
  - "Maintenance deletes on the remote whose tip it classified (MAINT-02)."
  - "A preflight whose `worktree add` fails removes nothing it did not create (MAINT-01)."
  - "Two contenders racing on an absent lease end with one holder; the lease is created with an exclusive create (MAINT-03)."
- shipped-in: `7cfb263c7815`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: claude-sonnet-5-5
- review-log: approved by claude-sonnet-5-5 — verified at 05f104c9e526, validate exit 0 and tests 135/135 claimed, no recorded run cited; acceptance 3/3: (1) maintain-ref-namespace.spec 'judges a ref by the tip of the remote it deletes on, not another remote's' passes (2) publish-candidate.spec 'removes only the worktree it created, never another invocation's' passes (3) maintenance-lease.spec 'ends a race on an absent lease with one holder' passes — verified by code reading and spec runs

### S3 — Cleanup and the start-up mutex report what happened
- **Status**: done
- **Files**: `packages/core/src/lib/integration-engine/cleanup-step.ts`, `packages/core/src/lib/integration-engine/git-port.interface.ts`, `packages/core/src/lib/integration-engine/git-operations.ts`, `packages/core/src/lib/integration-engine/types.interface.ts`, `packages/core/src/lib/startup-reconciler/startup-mutex.ts`, `packages/core/src/lib/startup-reconciler/startup-mutex.interface.ts`, `packages/core/src/lib/wip-engine/work-ref-lock.ts`, `packages/core/src/lib/work-units/work-unit-status.service.ts`
- **Gate**: type
- acceptance:
  - "A forge refusal of a branch deletion is a failed cleanup step with the forge's message (MAINT-04)."
  - "The start-up mutex is taken over from a holder on this machine only when its pid is gone (one on another machine, which cannot be probed, only past the TTL), and release removes the lock only if it still holds the owner token it wrote (ORCH-03)."
  - "A delivered work ref's tip stays reachable under refs/delendai/retired and `work status` names it (G63)."
- shipped-in: `c12e1dd4226c`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: claude-sonnet-5-5
- review-log: approved by claude-sonnet-5-5 — verified at 05f104c9e526, validate exit 0 and tests 135/135 claimed, no recorded run cited; acceptance 3/3: (1) cleanup-and-progress.spec 'reports the forge's refusal to delete its copy, with the forge's message' passes (2) startup-mutex.spec: live holder kept, dead pid taken over with old holder unable to release, other machine only past TTL; pass (3) work-unit-status.spec 'names the tip a delivered work ref left under the retired namespace' + unit-removal 'keeps the delivered tip reachable under the retired… — verified by code reading and spec runs

## acceptance

- A probe that fails classifies the branch as unknown and keeps it (RECLAIM-01).
- Deletion uses `git push --force-with-lease=<ref>:<classified sha>` or update-ref with the old value; a branch that advanced after classification survives (RECLAIM-02).
- AGENT-BOOTSTRAP.md and the other hand-written files are never classified generated (G158).
- Maintenance deletes on the remote whose tip it classified (MAINT-02).
- A preflight whose `worktree add` fails removes nothing it did not create (MAINT-01).
- Two contenders racing on an absent lease end with one holder; the lease is created with an exclusive create (MAINT-03).
- A forge refusal of a branch deletion is a failed cleanup step with the forge's message (MAINT-04).
- The start-up mutex is taken over from a holder on this machine only when its pid is gone (one on another machine, which cannot be probed, only past the TTL), and release removes the lock only if it still holds the owner token it wrote (ORCH-03).
- A delivered work ref's tip stays reachable under refs/delendai/retired and `work status` names it (G63).
