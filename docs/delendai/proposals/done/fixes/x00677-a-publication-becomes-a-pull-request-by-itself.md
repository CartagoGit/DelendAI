---
id: x00677
title: "A publication becomes a pull request by itself"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P0
related: [f00644, x00655]
last-transition-id: 86b3f9e3-6b87-4028-85c7-96ead250d62c
last-correlation-id: 86b3f9e3-6b87-4028-85c7-96ead250d62c
last-transition-from: in-progress
---

# x00677 — A publication becomes a pull request by itself

## goal

A published unit, a review batch included, reaches the integration
branch without anyone having to open its pull request, whichever agent
or host published it. The git guard enforces the integration branch's
rules, not those of the worktree the agent happens to be in.

## why

On 2026-09-26 and 27 publication refs of three reviewers sat on the forge
with no pull request. Nine were Copilot's, two and then twelve more were
GLM's, and every one of them was work that never landed. `work publish`
pushed the publication and stopped. Opening the pull request was left to
whoever published, and only one agent did it (by hand, every time). The
maintainer asked for review rounds to reach develop almost
automatically, since such a PR only moves proposal files.

GLM's refs were also outside the shape (`delendai/pr/glm-5.3-max/
x00566-review`), although the guard refuses such names since f00644.
The hooks ran `bun packages/cli/src/index.ts` from the pushing worktree,
and lefthook reads `lefthook.yml` from that worktree too. A worktree
entered before f00644 merged kept enforcing the old rules.

## why this design

- **Publishing opens the pull request.** After pushing, `work publish`
  finds the open pull request of the publication or opens one, when the
  policy integrates through pull requests and the remote is GitHub with
  its CLI available. The title comes from the unit's first commit that
  is not bookkeeping (claims, hand-offs), and the body lists the
  commits. It never arms auto-merge: that is the queue's job. Anything
  else is reported with the command to run. `--no-pull-request` skips it.
- **The local hydrator opens what hand pushes left.** After the
  integration branch moves, on the machine holding the credential,
  `open-publication-prs` opens the missing pull request of every
  publication that has the project's shape, through the same service.
  Misshapen ones are reported and left alone.
- **The guard runs the shared checkout's CLI.** The lefthook guard
  commands resolve the CLI through `git rev-parse --git-common-dir`,
  which is the shared checkout that x00675 keeps current. The rules are
  the integration branch's, whatever the worktree's age. (A worktree
  already created still reads its own `lefthook.yml` until it merges
  the integration branch.)

## non-goals

- Opening pull requests from CI: a PR opened with the workflow token
  starts no CI run.

## architecture

- `packages/cli/src/lib/publication-pull-request.service.ts`
  (+ `contracts/interfaces/publication-pull-request.interface.ts`),
  exported by `@delendai/cli`.
- `packages/cli/src/commands/work.command.ts`: publish calls it.
- `tools/scripts/forge/open-publication-prs.script.ts`, a hydration step.
- `lefthook.yml`: the guard commands.

## Slices

- global_gate: none

### S1 — Publications open their pull requests, and the guard is the integration branch's

- **Status**: done (git log: 7d0bd5252 Merge pull request #512 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00677-S1-g1/a-publication-becomes-a-pull-request-by-itself)
- **Gate**: `npx vitest run packages/cli/src/lib/publication-pull-request.service.spec.ts packages/cli/src/commands/work.command.spec.ts`
- **Files**:
  - `packages/cli/src/lib/publication-pull-request.service.ts`
  - `packages/cli/src/lib/publication-pull-request.service.spec.ts`
  - `packages/cli/src/contracts/interfaces/publication-pull-request.interface.ts`
  - `packages/cli/src/commands/work.command.ts`
  - `packages/cli/src/index.ts`
  - `tools/scripts/forge/open-publication-prs.script.ts`
  - `tools/scripts/git/hydrate-candidates-after-merge.script.ts`
  - `lefthook.yml`
- review-state: in_review
- review-implementer: claude-opus-5-5
## dependency graph

None.

## acceptance

- `work publish` of a unit on a GitHub remote ends with an open pull
  request of its publication, reusing one already open, and never arms
  it.
- The local hydrator opens the missing pull request of a well-shaped
  publication ref, and leaves misshapen ones alone with the reason.
- The guard hooks run the CLI of the shared checkout.
