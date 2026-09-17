---
id: x00547
title: "A work branch ends when it is published"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-17
tags:
    - git
    - workflow
    - agents
    - gates
---

# x00547 — A work branch ends when it is published

## goal

When an agent finishes a work branch
(`delendai/wip/<model>/<proposal>-<slice>-g<n>-<topic>`) and opens its pull
request, the work branch is deleted and only the publication branch
(`delendai/pr/...`) remains. The ref guard fails any published work branch
that is still there, and one command does the whole handoff.

## why

Measured after x00546 merged (#259, #260, #262):

- Nothing deleted a work branch once it was published. Every publication
  left two remote branches with the same content, and a graph client
  showed both as live work.
- `ref-lifecycle` counted a published work branch as `active`, which is
  green. Nothing noticed the leftovers, so removing them relied on an agent
  remembering to.
- `forge:publish` only knew how to publish the current `HEAD` under a
  `pr/` ref. Publishing from a work branch took manual pushes, a manual
  delete and manual pruning, and any one of those steps could be skipped.

## non-goals

- **No deletion of unpublished work.** A work branch whose tip is not in
  the integration branch or in a publication ref stays `active`.
- **No forced push or forced fetch** anywhere on the publication path.
- **No raised baseline or budget.**

## slices

### S1 — A published work branch is reapable and the guard fails on it

- **Status**: done — `IObservedRef.publishedIn` names the ref that already
  contains the work. A work ref that has one is assigned the
  `work-published` role, which counts as both `reapable` and
  `needsAttention`. The guard computes `publishedIn` by comparing the tip
  against the integration branch and every publication ref (`behind` or
  `identical`), and `--reap` deletes those refs and reports what it
  deleted. Live-verified on GitHub: a probe work branch turned the guard
  red, `--reap` deleted it, and the guard went back to green.
- **Files**: [`packages/core/src/lib/ref-lifecycle/reconcile.interface.ts`, `packages/core/src/lib/ref-lifecycle/reconcile.service.ts`, `packages/core/tests/src/lib/ref-lifecycle/work-namespace.spec.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.ts`, `tools/scripts/lint/ref-lifecycle-guard.script.spec.ts`]
- **Gate**: `npx vitest run --project core packages/core/tests/src/lib/ref-lifecycle/ && npx vitest run --project tools tools/scripts/lint/ref-lifecycle-guard.script.spec.ts`

### S2 — Publishing from a work branch removes it

- **Status**: done — `forge:publish --from-work-branch=<wip> --ref=<pr>`
  refuses a branch outside the work namespace, an unknown branch, a remote
  copy that is ahead of the local one, and a publication it cannot verify.
  Otherwise it proves the tip, pushes that exact object without force,
  checks that the forge reports the same SHA, and only then deletes the
  remote work branch, prunes it, removes its clean worktree and the local
  branch. With `--open-pr` it also opens the pull request. The decision
  logic is a pure planner covered by specs, and a text spec pins the order
  prove → push → verify → delete.
- **Files**: [`tools/scripts/forge/publish-candidate.interface.ts`, `tools/scripts/forge/publish-candidate.script.ts`, `tools/scripts/forge/publish-candidate.script.spec.ts`]
- **Gate**: `npx vitest run --project tools tools/scripts/forge/publish-candidate.script.spec.ts`

## acceptance

- `lint:ref-lifecycle` exits 1 while a work branch whose content is in
  develop or in a `pr/` ref still exists, and exits 0 after `--reap`.
- This proposal's own branch is published with
  `forge:publish --from-work-branch`, and afterwards only its `pr/` branch
  exists on the remote.
- The core and tools zones pass, and so do the lint-presets chain,
  `lint:architecture` and `format:all:check`, with no raised baseline.

## notes

A work branch that is merely behind develop is not published: the guard
checks whether its tip is contained in a container, and a branch with
unmerged commits of its own is never contained.
