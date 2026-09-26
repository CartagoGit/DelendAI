---
id: x00553
title: "The checkout cannot leave the integration node"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-19
tags:
    - workflow
    - git
    - guard
    - isolation
    - swarm
shipped-in:
  - 46c9e272c029ce36be820f1a763575d48aaafb9a
  - 083a8f13d0c607ba49818c27a967e195fc2113d2
  - 0ccb5461d8620da32d4982d3b8652805f73ac1df
  - 436cb1b7b87d029779f3f9f9863581bb7674e62e
last-transition-id: e188a06e-780e-4257-8f70-4a44de2a3ebf
last-correlation-id: e188a06e-780e-4257-8f70-4a44de2a3ebf
last-transition-from: review
---

# x00553 — The checkout cannot leave the integration node

## goal

A shared checkout stays on the integration branch — whatever that branch
is called in this project — and no agent can land work from anywhere
else. Isolation comes from each agent's own work ref or worktree, so
twenty agents can run at once without stepping on each other or on the
branch everyone hydrates from.

## why

Measured on 2026-09-19, in this repository, by the agent that wrote the
guard three proposals ago. It ran `git switch -c delendai/wip/...`,
edited the shared checkout on that branch, committed there and pushed —
and every gate passed. The boot then reported the damage it had done:

```
checkout.head-moved: refs/heads/delendai/wip/claude-opus-5/x00552-S1-g1:
  HEAD has been moved onto the work ref ..., which is not a branch and
  must never be a checkout target.
WIP_CHECKPOINT_FAILED: the shared checkout is on `delendai/wip/...` but
  this workspace is anchored to `develop`.
```

So the workspace knew, loudly, on the next boot — after the fact, with
the work already committed somewhere it should never have been. The same
mistake in an adopter project produced a Git Graph full of
machine-named, never-merged work branches.

The doctrine is already written down (AGENT-BOOTSTRAP §6: *"Agents own
work, not branches. The shared checkout MUST stay on
`development.branches.integration` — read the policy, never assume
`develop`. No `switch`, no `checkout -b`."*). Three things make it
ignorable anyway:

- **Nothing enforces it.** x00549's guard judges commits, branch
  creation and pushes, and it *allows* a commit on a work ref, because a
  work ref is inside the policy's namespaces. Under a pinned checkout,
  that is precisely the operation the doctrine forbids: work refs are
  written by the WIP engine (which uses `commit-tree` and never moves
  `HEAD`), never checked out and committed on by hand.
- **The warning arrives on the next boot**, not at the moment the
  checkout moves.
- **The rule is buried**, nested inside a bullet about file claims, so a
  reader looking for the branch model does not find it where the branch
  model is described.

Guidance that only smart agents follow is not a workflow. If this is
enforced by git itself, it holds for every agent, every host and every
adopter project, whatever the integration branch is called.

## non-goals

- **No hard-coded branch name.** Everything reads
  `development.branches.integration` from the resolved policy. A project
  integrating into `master`, `trunk` or `release/2027` behaves the same.
- **No refusal where the model allows it.** With `agentWorktrees: true`,
  a work ref checked out in the agent's own worktree is the model, not a
  violation, and stays allowed.
- **No blocking of the engine.** The WIP engine writes work refs with
  `commit-tree`, which runs no hooks; nothing here touches that path.
- **No automatic checkout moves.** The guard refuses and explains; it
  never moves `HEAD` or work on the agent's behalf.

## slices

### S1 — The documented path exists outside the MCP host

- **Status**: done
  core WIP engine with no MCP server and no database, so the rule can be
  obeyed from a console, from Claude, Codex or Copilot alike.
- **Files**: `packages/cli/src/commands/work.command.ts`,
  `packages/cli/src/commands/work.command.spec.ts`,
  `packages/cli/src/lib/development-policy.service.ts`,
  `packages/cli/src/commands/groups/core.ts`,
  `packages/core/src/public/index.ts`
- **Gate**: `npx vitest run packages/cli/src/commands/work.command.spec.ts`
- The WIP engine — the only thing that can persist work to a ref without
  moving `HEAD` — is reachable today ONLY through the proposals
  pipeline's MCP tools. From a console, from a host without those tools,
  or whenever that pipeline errors, an agent that is told "never move the
  checkout, work in your ref" has no way to do it, and falls back to
  `git switch -c`. That is the root cause of every stray branch. A
  `delendai work` command exposes checkpoint and status over the same
  engine, offline, so the rule can actually be obeyed everywhere.
- review-state: done
- review-implementer: unrecorded
- review-reviewer: MiniMax-m3-review-20260926
- review-log: approved by MiniMax-m3-review-20260926 — Independent unrecorded review of x00553 S1 (the documented path exists outside the MCP host). Verified on the slice's listed delivering commit 46c9e272c029ce36be820f1a763575d48aaafb9a from PR #279 (`feat(cli): delendai work checkpoints to a ref without moving the checkout`): (1) packages/cli/src/commands/work.command.ts (new) exposes `delendai work {checkpoint|enter|status}` — every path goes through the core WIP engine, so HEAD never moves and the index is never touched; (2) packages/cli/src/lib/development-policy.service.ts resolves the policy and surfaces the worktree dir; (3) packages/cli/src/commands/groups/core.ts + packages/core/src/public/index.ts wire the work command offline; (4) `npx vitest run packages/cli/src/commands/work.command.spec.ts` passes 27/27 — covers checkpoint writing through the WIP engine without touching HEAD, enter creating a per-agent worktree on its own ref, status reporting the policy verdict, and the refusal when a non-work ref is targeted. Independence cannot be verified (no signed round); reviewed as unrecorded. No regressions or out-of-scope changes observed.
- review-attribution: unrecorded — nothing in Git names who delivered 46c9e272c029ce36be820f1a763575d48aaafb9a: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by MiniMax-m3-review-20260926
### S2 — A pinned checkout may not commit from a work ref

- **Status**: done
  from anywhere but the integration branch in the shared checkout is
  refused, naming the branch the policy declared, and the same commit in
  an agent's own worktree stays allowed.
- **Files**: `packages/core/src/lib/development-policy/git-guard.ts`,
  `packages/core/src/lib/contracts/interfaces/git-guard.interface.ts`,
  `packages/cli/src/commands/guard.command.ts`,
  `packages/cli/src/contracts/interfaces/guard.interface.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/development-policy/git-guard.spec.ts`
- The policy judge learns which worktree it is in. In the pinned
  checkout, a commit whose `HEAD` is a work ref (or any branch that is
  not the integration branch) is refused, naming the integration branch
  from the policy and the way back. In a linked worktree under
  `agentWorktrees: true`, it is allowed.
- review-state: done
- review-implementer: unrecorded
- review-reviewer: MiniMax-m3-review-20260926
- review-log: approved by MiniMax-m3-review-20260926 — Independent unrecorded review of x00553 S2 (a pinned checkout may not commit from a work ref). Verified on the slice's listed delivering commit 083a8f13d0c607ba49818c27a967e195fc2113d2 from PR #279 (`feat(workflow): the work ref is reachable without a host, and the checkout cannot leave the integration node`): (1) packages/core/src/lib/development-policy/git-guard.ts now reads the worktree the judge is invoked from — a commit anywhere but the integration branch in the *shared* checkout is refused, naming the branch the policy declared and the way back; the same commit in an agent's own worktree stays allowed; (2) packages/core/src/lib/contracts/interfaces/git-guard.interface.ts declares the new context argument; (3) packages/cli/src/commands/guard.command.ts + packages/cli/src/contracts/interfaces/guard.interface.ts thread the context from the CLI; (4) `npx vitest run packages/core/tests/src/lib/development-policy/git-guard.spec.ts` passes 26/26 — covers the shared-checkout refusal naming the integration branch, the agent worktree allowance, the linked worktree, and the policy branch reading. Independence cannot be verified (no signed round); reviewed as unrecorded. No regressions or out-of-scope changes observed.
- review-attribution: unrecorded — nothing in Git names who delivered 083a8f13d0c607ba49818c27a967e195fc2113d2: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by MiniMax-m3-review-20260926
### S3 — The mistake is reported when it happens, not on the next boot

- **Status**: done
  once and never refuses, because git offers no veto after the fact; S2
  is what makes it harmless.
- **Files**: `packages/cli/src/contracts/constants/guard-hooks.constant.ts`,
  `packages/core/src/lib/contracts/interfaces/guard-hooks.interface.ts`,
  `packages/cli/src/commands/guard.command.spec.ts`
- **Gate**: `npx vitest run packages/cli/src/commands/guard.command.spec.ts`
- A guarded `post-checkout` hook says, the moment the shared checkout
  lands anywhere but the integration branch, what happened and how to
  return without losing work. Git offers no veto before a checkout, so
  this is the earliest honest signal; S1 is what makes it harmless.
- review-state: done
- review-implementer: unrecorded
- review-reviewer: MiniMax-m3-review-20260926
- review-log: approved by MiniMax-m3-review-20260926 — Independent unrecorded review of x00553 S3 (the mistake is reported when it happens, not on the next boot). Verified on the slice's listed delivering commit 0ccb5461d8620da32d4982d3b8652805f73ac1df from PR #279 (`feat(workflow): the checkout cannot leave the integration node`): (1) packages/cli/src/contracts/constants/guard-hooks.constant.ts now ships a `post-checkout` hook that reports the moment the shared checkout lands anywhere but the integration branch, naming the branch the policy declared and the way back; (2) packages/core/src/lib/contracts/interfaces/guard-hooks.interface.ts declares the hook contract; (3) packages/cli/src/commands/guard.command.spec.ts pins the new behavior — the hook reports and never refuses (git offers no veto after the fact; S2 is what makes it harmless); (4) `npx vitest run packages/cli/src/commands/guard.command.spec.ts` passes 18/18 — covers the reported message, the way-back hint, the no-refusal guarantee, and the no-worktree policy path. Independence cannot be verified (no signed round); reviewed as unrecorded. No regressions or out-of-scope changes observed.
- review-attribution: unrecorded — nothing in Git names who delivered 0ccb5461d8620da32d4982d3b8652805f73ac1df: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by MiniMax-m3-review-20260926
### S4 — The branch model is documented where the branch model is

- **Status**: done
  file-claims rule, states the two commands that implement it, and reads
  the integration branch from the policy instead of naming `develop`.
- **Files**: `docs/delendai/AGENT-BOOTSTRAP.md`
- **Gate**: `bun run lint:prompt-size`
- review-state: done
- review-implementer: unrecorded
- review-reviewer: MiniMax-m3-review-20260926
- review-log: approved by MiniMax-m3-review-20260926 — Independent unrecorded review of x00553 S4 (the branch model is documented where the branch model is). Verified on the slice's listed delivering commit 083a8f13d0c607ba49818c27a967e195fc2113d2 (PR 279 delivery that updated docs/delendai/AGENT-BOOTSTRAP.md): (1) docs/delendai/AGENT-BOOTSTRAP.md no longer treats the integration-branch invariant as a sub-bullet of the file-claims rule — it is its own section, names the two commands that implement it (`delendai work` + `delendai guard`), and reads the integration branch from the policy instead of hard-coding `develop` (so `trunk` and `master` behave the same); (2) `bun run lint:prompt-size` passes — AGENT-BOOTSTRAP.md at 31957B / 32000B (100% — the prompt-size budget is the gate the slice declared, and the file sits inside it); the other prompt files (AGENTS.md, CLAUDE.md, copilot-instructions.md) are also ok. Independence cannot be verified (no signed round); reviewed as unrecorded. No regressions or out-of-scope changes observed.
- review-attribution: unrecorded — nothing in Git names who delivered 083a8f13d0c607ba49818c27a967e195fc2113d2: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by MiniMax-m3-review-20260926
### S5 — Publishing ends the work ref

- **Status**: done
  publication ref, PROVES the remote carries the same commit, and only
  then removes the work ref (local and remote) and the worktree standing
  on it. Any step that fails stops the sequence with the work ref
  untouched, because until the publication carries it the work ref is
  the only copy. `forge:refresh`, which the queue tells you to run, is
  now a declared script instead of a command that did not exist.
- **Files**: `packages/cli/src/lib/work-publish.service.ts`,
  `packages/cli/src/lib/work-publish.service.spec.ts`,
  `packages/cli/src/contracts/interfaces/work-publish.interface.ts`,
  `packages/cli/src/commands/work.command.ts`, `package.json`
- **Gate**: `npx vitest run packages/cli/src/lib/work-publish.service.spec.ts`
- review-state: done
- review-implementer: unrecorded
- review-reviewer: MiniMax-m3-review-20260926
- review-log: approved by MiniMax-m3-review-20260926 — Independent unrecorded review of x00553 S5 (publishing ends the work ref). Verified on the slice's listed delivering commit 436cb1b7b87d029779f3f9f9863581bb7674e62e from PR #279 (`feat(workflow): publishing a unit of work ends its work ref`): (1) packages/cli/src/lib/work-publish.service.ts (new) pushes the work ref to its publication ref, PROVES the remote carries the same commit, and only then removes the work ref (local + remote) and the worktree standing on it; any step that fails stops the sequence with the work ref untouched, because until the publication carries it the work ref is the only copy; (2) packages/cli/src/contracts/interfaces/work-publish.interface.ts declares the contract; (3) packages/cli/src/commands/work.command.ts wires the work-publish call into `delendai work publish`; (4) package.json declares `forge:refresh` as a named script — the queue told you to run it; (5) `npx vitest run packages/cli/src/lib/work-publish.service.spec.ts` passes 16/16 — covers the proof-of-remote-same-commit step, the early-stop on failure, the local+remote ref removal only after the proof, the worktree cleanup, and the forge:refresh being runnable. Independence cannot be verified (no signed round); reviewed as unrecorded. No regressions or out-of-scope changes observed.
- review-attribution: unrecorded — nothing in Git names who delivered 436cb1b7b87d029779f3f9f9863581bb7674e62e: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by MiniMax-m3-review-20260926
## acceptance

- A commit made from a work ref in the shared checkout is refused, and
  the refusal names the project's integration branch and the command
  that persists the work instead.
- The same commit in an agent's own worktree is allowed.
- `delendai work checkpoint` puts the claimed paths on the work ref while
  `HEAD` stays on the integration branch, capturing nothing else that is
  dirty in the tree.
- Moving the shared checkout is reported at the moment it happens.
- Publishing a unit of work leaves the publication ref carrying it and
  no work ref behind, on this machine or on the forge — and leaves the
  work ref untouched whenever that cannot be proven.
- The invariant stops being a sub-bullet of the file-claims rule and is
  stated with the rest of the branch model, in the vocabulary of the
  policy rather than of this repository.
