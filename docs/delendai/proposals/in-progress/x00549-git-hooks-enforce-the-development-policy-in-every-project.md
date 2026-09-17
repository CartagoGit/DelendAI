---
id: x00549
title: "Git hooks enforce the development policy in every project"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-17
tags:
    - git
    - workflow
    - agents
    - host-agnostic
    - gates
---

# x00549 — Git hooks enforce the development policy in every project

## goal

In any project that declares a development policy, git itself refuses the
operations that policy forbids, whoever runs them: an agent through
delendai's tools, an agent with a shell, a subagent in another host, or a
human. Guidance tells an agent how to work; a hook makes working any other
way impossible.

## why

Observed on 2026-09-17 in a project on `shared-checkout-merge` that runs
delendai from this repository:

- The agent committed straight to `develop` all day, although the profile
  forbids direct integration commits.
- After `agent_worktree` was refused, the agent created worktrees and
  `agent/<role>/<id>-<slice>-<topic>` branches by hand with plain git.
- The project's own hooks were a hand-written `post-commit` that pushes a
  branch that no longer exists, and a `reference-transaction` that bumps
  versions on tags. Nothing enforced the policy.

This repository enforces it only for itself: `refuse-integration-commit`
and `commit-branch-discipline` are repo-local lefthook scripts under
`tools/scripts`, which no adopter receives. x00548 S4 fixed the guidance
that sent agents to worktrees; guidance can still be ignored.

## non-goals

- **No new policy.** Every refusal is a reading of the resolved
  development policy; with no declared policy, nothing is refused.
- **No clobbering of existing hooks.** A project's own hooks keep running;
  delendai's guard is added beside them and can be removed cleanly.
- **Remote-tracking refs, tags and updates to existing branches are never
  judged.** Fetching, pulling, rebasing and tagging stay untouched.

## slices

### S1 — The policy judges a commit, a branch creation and a push

- **Status**: done — `judgeGitOperation` (on `@delendai/core/cli`) judges
  the three operations from the resolved policy alone, reusing
  `describeWorkIsolation` for the remedy so a refusal and the guidance can
  never disagree. Namespaces are compared without `refs/` and `heads/`, so
  `heads/wip/` and `agent/` read alike. Specs pin the observed project's
  operations under `shared-checkout-merge` (direct commit to `develop` and
  hand-made `agent/*` branches refused; merges, `wip/*` work refs and `pr/*`
  refs allowed), this repository's namespaced `shared-checkout-pr`, and
  `shared-direct`, `worktree-pr` and no policy at all.
- **Files**: [`packages/core/src/lib/development-policy/git-guard.ts`, `packages/core/src/lib/contracts/interfaces/git-guard.interface.ts`, `packages/core/src/cli.ts`, `packages/core/tests/src/lib/development-policy/git-guard.spec.ts`]

A pure judge in core, from the resolved policy alone:

- **commit**: refused on the integration branch when the policy forbids
  direct integration commits (merge commits excepted), and, under a pinned
  checkout, on a branch outside the policy's namespaces. A work branch in
  a linked worktree is inside them, so delendai's own flow is unaffected.
- **branch creation** (`refs/heads/*` only, creation only): refused under a
  pinned checkout unless the branch is the integration or release branch
  or sits under the work, publication or foreign prefixes.
- **push** to `refs/heads/*`: refused onto the integration or release
  branch when the policy requires pull requests, and onto a branch outside
  the policy's namespaces under a pinned checkout; deletes are allowed.

Every refusal names the profile, the rule and what to do instead.

- **Gate**: `npx vitest run packages/core/tests/src/lib/development-policy/git-guard.spec.ts`

### S2 — `delendai guard <hook>` runs the judge from a git hook

- **Status**: pending
- **Files**: []

A CLI entry that git hooks call: `pre-commit`, `reference-transaction` and
`pre-push`. It resolves the project's own policy from its configuration,
reads what git passes (arguments, stdin ref lines), and exits non-zero with
the verdict when refused.

- **Gate**: a real repository with the hooks pointing at the entry: a
  forbidden commit, branch and push fail; allowed ones succeed.

### S3 — Install the guard beside a project's existing hooks

- **Status**: pending
- **Files**: []

Resolve the hooks directory (`core.hooksPath`, as husky sets it, or
`.git/hooks`), add a marked block that calls the guard to each hook without
touching what is already there, and remove exactly that block on uninstall.
Idempotent. A hook manager that regenerates hook files (lefthook) is
detected and reported with the configuration to add, rather than written
into and overwritten.

- **Gate**: specs over plain, husky-style and existing-hook repositories:
  existing hooks still run, a second install changes nothing, uninstall
  restores the files byte for byte.

### S4 — A project with a declared policy gets the guard automatically

- **Status**: pending
- **Files**: []

At startup, a project whose configuration declares a development policy
has the guard installed or updated, and the startup report says so. A
configuration switch turns it off. A project without a declared policy is
left alone.

- **Gate**: a startup spec: installed when a policy is declared, untouched
  when not, not installed when switched off.

## acceptance

- In a project on `shared-checkout-merge`, `git commit` on the integration
  branch, `git switch -c agent/x` and `git worktree add -b agent/x` all
  fail with the policy's reason, from any shell.
- delendai's own flows (checkpoints to work refs, publication refs) keep
  working under the guard.
- A project's existing hooks keep running and can be restored exactly.
