---
id: x00695
title: "Each agent has its own worktree"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [x00688, x00553]
last-transition-id: 261daa45-0d11-4d74-b19a-a817bc961551
last-correlation-id: 261daa45-0d11-4d74-b19a-a817bc961551
last-transition-from: in-progress
---

# x00695 — Each agent has its own worktree

## goal

Two agents never share a worktree, and no agent's worktree shows in the
shared checkout as an untracked directory.

## why

Watching a swarm of five reviewers on 2026-09-27:

- **Two agents shared one directory.** `work enter` named a unit's
  worktree `${proposal}-${slice}` only. Every reviewer entering a review
  batch (`--proposal=batch --slice=all`) was sent to
  `.cache/delendai/.worktrees/batch-all`. The `copilot` and `minimax-3`
  units took turns checking their branches out in that same directory,
  each working in the other's tree. A third agent created its branch and
  got no worktree at all.
- **A worktree landed in the shared checkout.** An agent placed its
  worktree with `--dir=batch-g5`, at the repository root. The shared
  checkout showed `?? batch-g5/`, a loose edit on the integration branch.

## why this design

- **The path carries the agent, as the unit does.** The default is
  `${agent}-${proposal}-${slice}`. A unit's identity already includes its
  agent, so one agent re-entering its unit finds the same worktree and
  two agents never meet.
- **An explicit `--dir` must be ignored or outside.** A path inside the
  repository that git does not ignore is refused. It is checked as a
  directory, since that is what a worktree is. The default location is
  delendai's own, self-ignoring directory.

## non-goals

- Moving worktrees entered before this change.

## architecture

- `packages/cli/src/commands/work.command.ts`: the default path and the
  `--dir` check in `work enter`.

## Slices

- global_gate: none

### S1 — One worktree per agent, never in the shared tree

- **Status**: review
- **Gate**: `npx vitest run packages/cli/src/commands/work.command.spec.ts`
- **Files**:
  - `packages/cli/src/commands/work.command.ts`
  - `packages/cli/src/commands/work.command.spec.ts`
  - `packages/cli/src/commands/work-ref-migration.spec.ts`
- review-state: in_review
- review-implementer: claude-opus-5-5
## dependency graph

None.

## acceptance

- `glm-5` and `minimax-m3` entering the same review batch get
  `glm-5-batch-all` and `minimax-m3-batch-all`.
- `--dir=batch-g5` in the repository root is refused as a loose edit on
  the integration branch; an ignored `--dir` is accepted.
