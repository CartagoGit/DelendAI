---
id: x00554
title: "A green pull request lands itself and the swarm rebases"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-09-19
tags:
    - workflow
    - integration
    - hydration
    - swarm
---

# x00554 — A green pull request lands itself and the swarm rebases

## goal

A pull request that passes its checks integrates on its own, the
integration node hydrates, and every work ref and publication ref that
was based on the old tip is re-based onto the new one — without anybody
watching, and without an agent discovering hours later that it built on
a base nobody else has.

## why

Observed on 2026-09-19 in this repository. `#276` passed every check and
then sat merged-but-unpropagated while `#277` and `#270` stayed behind
develop; `#270` (x00547 S3) has been green and unintegrated long enough
to be 33 commits behind, so its conflicts are now a task of their own.
Meanwhile every open work ref is still based on a tip that moved.

Two costs, both paid by every agent:

- **Work is done against a stale base.** A swarm's whole premise is that
  each agent starts from the same ground. When the ground moves and
  nothing re-bases, agents produce conflicting work and discover it at
  publication time, which is the most expensive moment.
- **Integration waits on a human.** The value of a green check is that
  it authorises the merge; requiring somebody to notice it throws that
  away and makes the rest of the swarm wait.

The machinery already exists and is unused for this: the WIP engine's
`rebaseWipOntoNewBase` replays a work ref onto a new base and reports
`RECOVERY_CONFLICT` instead of guessing, and the startup reconciler
already hydrates the checkout.

## non-goals

- **No merging of red or unreviewed work.** Auto-merge is conditioned on
  the checks the project declares required, not on "no failures yet".
- **No silent conflict resolution.** A ref that cannot be replayed keeps
  its old base and is reported; nothing is forced, nothing is dropped.
- **No forced strategy.** Projects that integrate locally (`shared-*`
  merge profiles) get the same cascade through their own integration
  path; the trigger is the policy's, not GitHub's.

## slices

### S1 — A green publication ref integrates without being asked

- **Status**: done — a publication ref is armed for auto-merge without
  anybody asking, and it is now armed **with the method the project
  declared**. That second half was missing and is the reason this slice
  says "honouring the policy's integration method": both arming sites
  passed a literal `--merge`. The literal is correct for this repository,
  which declares `merge`, which is exactly why it survived —
  `worktree-pr`, the profile recommended for a swarm, declares `squash`,
  so on such a project the queue either lands candidates a way nobody
  chose or the forge refuses the arming and the candidate sits unarmed
  with nothing to explain it. `declaredMergeMethod` and `mergeFlagFor`
  live in the one policy reader the scripts already share, so the queue
  and the forward-sync cannot disagree. Nothing merges that the policy
  would not have merged by hand: auto-merge still waits for the required
  checks, and this changes only HOW it lands, never WHETHER.
- **Gate**: `npx vitest run packages/core/tests/src/lib/startup-reconciler`
- **Files**: `tools/scripts/lib/declared-branches.ts`,
  `tools/scripts/forge/keep-the-queue-moving.script.ts`,
  `tools/scripts/forge/keep-the-queue-moving.script.spec.ts`,
  `tools/scripts/forge/forward-sync-release.script.ts`,
  `tools/scripts/forge/forward-sync-release.script.spec.ts`,
  `tools/scripts/forge/forward-sync-release.interface.ts`
- The forge seam enables the project's declared auto-merge for a
  publication ref once the required checks pass, honouring the policy's
  integration method. Nothing merges that the policy would not have
  merged by hand.

### S2 — Hydration cascades to every dependent ref

- **Status**: pending
- **Gate**: `npx vitest run packages/core/tests/src/lib/startup-reconciler`
- **Files**: `packages/core/src/lib/startup-reconciler/**`, `packages/core/src/lib/wip-engine/rebase.ts`, `tools/scripts/forge/**`
- When the integration node moves, each work ref based on the old tip is
  replayed onto the new one through `rebaseWipOntoNewBase`, and each
  publication ref is refreshed. A conflict is reported per ref, with the
  paths, and leaves that ref untouched.

### S3 — An agent is told its base moved under it

- **Status**: pending
- **Gate**: `npx vitest run packages/core/tests/src/lib/startup-reconciler`
- **Files**: `packages/core/src/lib/startup-reconciler/**`, `packages/core/src/lib/wip-engine/rebase.ts`, `tools/scripts/forge/**`
- The boot and the work-status surface say, per work unit, whether it is
  based on the current integration tip, and what to run when it is not.

## acceptance

- A publication ref whose required checks pass integrates without anyone
  asking it to, by the method the policy declares.
- After the integration node moves, every work ref based on the old tip
  is replayed onto the new one, and a ref that cannot be replayed is
  reported with its conflicting paths and left untouched.
- An agent whose base moved is told so, with what to run.

