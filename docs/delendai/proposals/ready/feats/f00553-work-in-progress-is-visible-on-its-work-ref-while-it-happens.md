---
id: f00553
title: "Work in progress is visible on its work ref while it happens"
kind: feat
status: ready
type: proposal
track: workflow
date: 2026-09-24
---

# f00553 — Work in progress is visible on its work ref while it happens

## goal

A project can decide whether the work an agent is doing is checkpointed
to its work ref and published while it happens, so a person can watch it
on `delendai/wip/<agent>/<proposal>-<slice>-g<n>/<topic>` until it
becomes a publication ref and a pull request. **On by default**, in this
repository and in every project that adopts delendai. A project that
prefers to see only finished pull requests can turn it off.

## why

Measured on 2026-09-23. An agent worked for hours on several slices and
the only places its work appeared were the pull requests at the end.
While it worked, the remote carried no work ref at all, so the person
could not tell from the repository what was happening. The work-ref
model already exists for exactly this (work refs, `autoPushAfterCommit:
true` in every profile, `delendai work checkpoint`). But nothing
checkpoints on the agent's behalf as it goes: a checkpoint happens only
when `commit-policy` fires a trigger or someone runs the command. An
agent that commits in its own worktree and publishes at the end never
touches a work ref.

Visibility is also safety. Work that exists only in one agent's worktree
is lost if that session dies, and invisible to the swarm briefing
(x00555) that tells other agents what is being touched.

## why this design

- **One switch, with the cadence stated once**, in the development
  policy every reader already resolves:
  `development.workInProgress: { visible: boolean, checkpoint: 'commit' | 'interval' | 'slice' }`,
  defaulting to `{ visible: true, checkpoint: 'commit' }`. `commit`
  means every commit the agent makes in its work checkout is
  checkpointed and published to its work ref. `interval` and `slice`
  reuse `commit-policy`'s existing triggers instead of adding new ones.
- **Named by the agent that did the work.** The ref carries the exact
  agent identity (`resolveWorkAgent`, x00617). A host that cannot tell
  who is working publishes under `unknown-agent`, and says so, rather
  than under a client or machine name.
- **Only real work is published.** A checkpoint with nothing new must
  publish nothing (x00627), and finished work arriving through a merge
  must not be replayed as somebody's work in progress (x00627).
  Visibility without those two guarantees is what produced 135 empty
  refs in 42 minutes, so this depends on x00627.
- **The work ref ends when the work is published** (existing rule): the
  move to the publication ref deletes the work ref, so a finished slice
  never leaves a WIP behind.
- **Off means off.** With `visible: false`, work stays local until
  publication, and no work ref is pushed on the agent's behalf.

## non-goals

- Deciding how work is grouped into pull requests; that is f00554.
- Publishing a person's own commits. This applies to agent work only,
  using the same agent/person distinction as x00626.

## Slices

- global_gate: none

### S1 — The policy field, resolved once

- **Status**: pending
- **Gate**: `npx vitest run packages/core/tests/src/lib/development-policy`
- **Files**: `packages/core/src/lib/contracts/interfaces/development-policy.interface.ts`,
  `packages/core/src/lib/development-policy/profiles.ts`,
  `packages/core/src/lib/development-policy/resolve.ts`
- `workInProgress` resolves with its default on every profile, is shown
  by `work status` and the doctor, and is documented where the other
  development fields are.

### S2 — Agent commits checkpoint to the work ref as they happen

- **Status**: pending
- **DependsOn**: [S1]
- **Gate**: `npx vitest run plugins/commit-policy/tests`
- **Files**: the commit-policy trigger and the WIP persistence path — the
  literal list is recorded when the slice ships
- With `checkpoint: 'commit'`, a commit made by an agent in its work
  checkout checkpoints its claimed paths to its work ref and publishes
  it. Proved in a real repository, with the ref visible on a bare
  remote after the commit and gone after publication.

### S3 — The agent's own publication flow goes through the work ref

- **Status**: pending
- **DependsOn**: [S2]
- **Gate**: `bun run lint:ref-lifecycle`
- **Files**: `docs/delendai/AGENT-BOOTSTRAP.md` source rules — the literal
  list is recorded when the slice ships
- The bootstrap tells agents to work on their work ref (as the engine
  names it) rather than in an anonymous detached worktree, so their work
  is visible without any extra step.

## acceptance

- With the default, an agent's work appears on the remote as a work ref
  named after that agent within one commit of being made, and the ref is
  gone once its pull request is open.
- With `visible: false`, no work ref is pushed on an agent's behalf.
- No empty and no replayed work ref is ever published (x00627 holds).
