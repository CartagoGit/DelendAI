---
id: x00627
title: "A checkpoint of nothing publishes nothing, and finished work is not replayed"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-24
---

# x00627 — A checkpoint of nothing publishes nothing, and finished work is not replayed

## goal

A work ref reaches the remote only when it carries work that exists
nowhere else, made by the agent it is named after. Two paths violate
that today, and together they are the source of the "dozens of
unfinished WIPs with the wrong name" reported on 2026-09-22.

## why

Measured on 2026-09-23. The remote received
`delendai/wip/claude-code/x00621-S1-g1/the-one-act-levels-both-projections-by-the`,
pointing exactly at the tip of `develop`, with 0 commits of its own.
Every open pull request's `ref-lifecycle` job then went red over a ref
none of them had created. The name was a client name, not the agent,
because the host ran code from before x00617. The ref itself came from
two defects, found by reading the path end to end:

1. **An unchanged checkpoint is published anyway.**
   `wip-persistence.ts` calls the WIP engine; since x00610 the engine
   answers `unchanged` for a scope identical to its base, with
   `commit = parentSha` and no local ref. The persistence layer then
   calls `publishWorkRef(…, result.commit, …)` regardless of the status,
   so it pushes a remote ref at the base commit, reaps, and hands off to
   integration, all for nothing. x00610 closed this door in the engine;
   the layer above walked around it.
2. **Finished work arriving by merge is replayed as this host's work.**
   `commit-policy`'s slice trigger polls the proposal index every second
   and emits an event for every slice newly seen as `done`. It asks one
   question before emitting: has *this host* processed this event
   (`isAlreadyPersisted`)? A slice closed by another agent and merged
   into the integration branch was never processed by this host, so it is
   emitted, claimed, checkpointed and published under the host's
   identity. The index is a projection, and a change in a projection is
   being read as an act.

## why this design

- **Publish only what exists.** On `unchanged`, the persistence layer
  publishes nothing, reaps nothing and hands off nothing, unless a local
  work ref already holds that commit and is simply missing on the remote
  (a durability retry).
- **An event is an act only if the act is uncommitted.** Before
  emitting, the slice trigger asks git whether any of the slice's paths
  has a change that is not yet committed. If none has, the close is
  already in a commit (someone's) and there is nothing to persist, so the
  event is acknowledged without a claim, a checkpoint or a push. This is
  agnostic: it relies on git alone, not on which host or runtime closed
  the slice.

## non-goals

- Changing when a real, uncommitted slice close is persisted.

## Slices

- global_gate: none

### S1 — An unchanged checkpoint is not published

- **Status**: done (#370)
- **Gate**: `npx vitest run plugins/commit-policy/tests`
- **Files**: `plugins/commit-policy/src/lib/persistence/wip-persistence.ts`,
  `plugins/commit-policy/src/lib/persistence/wip-publication.ts`,
  `plugins/commit-policy/tests/src/lib/persistence/unchanged-checkpoint.persistence.spec.ts`
- A spec with a real repository: a checkpoint over an unchanged scope
  leaves the bare remote without the ref; a checkpoint with a change
  publishes it.

### S2 — A slice already committed is not replayed

- **Status**: done (#375) — later polls ask the question the first poll already asked, so there is one rule for both
- **Gate**: `npx vitest run plugins/commit-policy/tests`
- **Files**: `plugins/commit-policy/src/lib/triggers/slice-listener.ts`,
  `plugins/commit-policy/tests/src/lib/triggers/slice-listener-baseline.spec.ts`,
  `plugins/commit-policy/tests/src/slice-replay.plugin.spec.ts`
- A slice that turns `done` because a merge brought it in produces no
  event; a slice closed in the working tree, with its change uncommitted,
  still does. Both are driven through a real repository.

## acceptance

- After merging another agent's finished proposal into a checkout whose
  host runs `commit-policy` with a slice trigger, no work ref appears on
  the remote.
- A real uncommitted slice close is still checkpointed and published.
