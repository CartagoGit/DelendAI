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

The work an agent is doing is checkpointed to its work ref and published
while it happens, so a person can watch it
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

- **No new setting: the policy already says both things.** Visibility is
  `branches.workRefVisibility` (`visible` by default in every profile,
  which puts work refs under `refs/heads/…wip/` where Git clients show
  them), and cadence is `checkpoint.strategy` (`slice | interval |
  continuous`) with `intervalMinutes` (5 on the shared profiles). A
  `workInProgress` field would be a second statement of the same two
  facts, which is exactly the defect f00552 exists to stop. So "on by
  default, switchable" is `visible` + a cadence, and "off" is
  `workRefVisibility: hidden` or a cadence of `slice`.
- **Corrected on 2026-09-24, before any code:** this proposal first said
  `derive.ts` turns the checkpoint cadence into `commit-policy` triggers.
  It does not. `commit-policy` reads its triggers only from its own
  `options.cadence.triggers` (this repository declares `slice` alone),
  and nothing reads `checkpoint.intervalMinutes` except validation. The
  same cadence is stated in two places and one of them is ignored. So
  the first slice makes the development policy the one source of the
  interval, and a plugin option that disagrees with it is refused.
- **What is missing is the act, not the setting.** The cadence is applied
  to work the engine knows about. An agent that works in an anonymous
  detached worktree and publishes at the end, as the agent that found
  this did all day, never gives the engine anything to checkpoint. So the
  fix is where the work happens: an agent works in its engine work
  checkout (`delendai work enter`), named by the policy's template, and
  the declared cadence checkpoints it.
- **Named by the agent that did the work** (`resolveWorkAgent`, x00617);
  a host that cannot tell who is working publishes under
  `unknown-agent`, and says so.
- **Only real work is published.** A checkpoint of nothing publishes
  nothing (x00627 S1), and finished work arriving through a merge is not
  replayed as someone's work in progress (x00627 S2).
- **The work ref ends when the work is published**, as it already does:
  moving to the publication ref deletes it.

## non-goals

- Deciding how work is grouped into pull requests; that is f00554.
- Publishing a person's own commits: this is agent work only (x00626).

## Slices

- global_gate: none

### S1 — The development cadence is the one source of the interval

- **Status**: pending
- **Gate**: `npx vitest run plugins/commit-policy/tests packages/core/tests/src/lib/development-policy`
- **Files**: the commit-policy trigger resolution and the development
  policy's combination validation — the literal list is recorded when
  the slice ships
- With `checkpoint.strategy` `interval` or `continuous`, `commit-policy`
  runs an interval trigger every `checkpoint.intervalMinutes` without
  any plugin option saying so. A plugin option that declares a different
  interval is refused at resolution with the path of each statement,
  rather than one silently winning.

### S2 — Committed work in an agent's work checkout is published at each tick

- **Status**: pending
- **DependsOn**: [S1]
- **Gate**: `npx vitest run plugins/commit-policy/tests`
- **Files**: a commit-policy service for work checkouts — the literal
  list is recorded when the slice ships
- With `workRefVisibility: visible`, at each interval tick every worktree
  whose branch is under the policy's work-ref prefix and is ahead of its
  remote copy is pushed. Proved in a real repository with a bare remote:
  the ref appears while the work goes on and is gone after publication.
- Uncommitted work in such a checkout is not checkpointed by the host:
  moving the ref of a branch another process has checked out would leave
  that worktree showing its own changes reverted. The agent's commits
  are the unit this slice publishes, and the bootstrap (S3) says so.

### S3 — Agents work where the cadence can see them

- **Status**: pending
- **DependsOn**: [S2]
- **Gate**: `bun run lint:prompt-size`
- **Files**: `docs/delendai/AGENT-BOOTSTRAP.md`
- The bootstrap tells an agent to enter its work (`delendai work enter`),
  to work and commit in that checkout, not in an anonymous worktree, and
  that its commits appear on the remote at the declared cadence.

## acceptance

- With the default, an agent's work appears on the remote as a work ref
  named after that agent within one commit of being made, and the ref is
  gone once its pull request is open.
- With `workRefVisibility: hidden` (or a `slice` cadence), no work ref is
  pushed on an agent's behalf while it works.
- No empty and no replayed work ref is ever published (x00627 holds).
