---
id: x00602
title: "The integration branch is discovered, not assumed"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-22
tags:
    - adoption
    - policy
---

# x00602 — The integration branch is discovered, not assumed

## goal

A project whose trunk is not `develop` can use delendai.

## why

Driven through the real CLI, in a project that is not this one:

```
$ git init -b main && echo '{"development":{"profile":"shared-checkout-merge"}}' > delendai.config.json
$ delendai guard pre-commit
delendai guard (pre-commit): refused — the shared checkout is on `main`,
  but the `shared-checkout-merge` development profile anchors it to `develop`.
Return it with `git switch develop` …
```

**Every commit refused, with a remedy that cannot be followed** — the
branch does not exist in their repository. Anyone whose trunk is `main`
or `master`, which is most projects, could adopt delendai and then not
commit.

`resolveDevelopmentPolicy` is pure: it cannot look at a checkout, so when
a project declares no `branches.integration` it answers `develop`.
That is this repository's habit, and a habit is not a default.

x00589 wrote the agnostic rule into `projectBranches` — and **nothing on
this path read it.** `readWorkspacePolicy`, the one reader the guard and
`delendai work` share by design, called `resolveDevelopmentPolicy`
directly and believed the literal.

## non-goals

- Making the refusal go away. A pinned profile does forbid committing
  directly to the integration branch; that refusal is correct. What was
  wrong is which branch it named and what it told you to do.

## why this design

The obvious fix — "the integration branch is whatever the checkout is
on" — was written first, and two existing tests refused it. They were
right: it makes every check that depends on the integration branch
**vacuous**. "The shared checkout has not left it" cannot fail when it is
defined as wherever the checkout currently is, so the post-checkout
warning that exists to say *you have wandered* goes silent exactly when
somebody wanders.

The integration branch has to be a stable fact about the project, not a
reading of its current state.

## architecture

`defaultBranchOf(root)` answers from what is stable and discoverable, in
order, stopping at the first that answers:

1. `refs/remotes/origin/HEAD` — the default branch the forge itself
   publishes. The real answer whenever there is a remote.
2. `init.defaultBranch` from git's configuration, when a branch by that
   name exists here. Somebody stated it.
3. Exactly **one** of the conventional trunks present locally. Two of
   them is ambiguity, and ambiguity is not an answer — a repository
   holding both `main` and `master` has made a choice this list cannot
   read.

When none answers it declines, and the policy keeps its own value. It
does not guess: guessing is what produced the bug.

`readWorkspacePolicy` asks it — the one reader the guard and `delendai
work` share by design — and asks the **shared checkout**, never the
worktree the caller is standing in: which branch integrates is a fact
about the project, and an agent would otherwise be told that its own wip
ref is it.

### two questions that were wearing one name

`projectBranches` is left as x00589 wrote it, answering from the branch
the workspace is on. Its own test refused the change, and it was right
to: the **branch reaper** is one of its callers, and what a reaper needs
is "which branch must never be deleted" — for which "the one somebody is
standing on" is exactly the conservative answer, and a discovered one
would have teeth.

"Which branch must not be reaped" and "which branch does work integrate
into" are different questions. They had one name, and the first design
here answered both with the second's answer.

### one shared-checkout resolver

"Where is the pinned checkout" was written four times — in the guard, in
the workflow doctor, in the proposals reconciler, in the id-counter
source — each with its own spelling and its own failure mode. One of them
read `.git` as a directory and silently degraded in every worktree, which
is the ordinary case for an agent.

`sharedCheckout(from)` and `commonGitDir(from)` now live in core and the
doctor re-exports its old name. The reconciler's copy is left alone
deliberately: it reads git's plumbing without spawning a subprocess, on
purpose, and collapsing it would trade that property away.

## slices

### S1 — the branch is discovered from the project, not assumed

- **Status**: review
- **Files**: [`tools/scripts/lint/no-hardcoded-branch-names.baseline.json`, `packages/core/src/lib/development-policy/default-branch.ts`, `packages/core/src/lib/development-policy/default-branch.constant.ts`, `packages/core/src/lib/development-policy/project-branches.ts`, `packages/core/src/lib/shared/shared-checkout.ts`, `packages/core/src/public/index.ts`, `packages/cli/src/lib/development-policy.service.ts`, `packages/cli/src/lib/development-policy.service.spec.ts`, `packages/cli/src/lib/workflow-doctor.service.ts`, `packages/cli/src/commands/guard.command.spec.ts`]
- **Gate**: `npx vitest run packages/cli/src/lib/development-policy.service.spec.ts packages/cli/src/commands/guard.command.spec.ts`

## acceptance

- A project on `main` that declares no integration branch resolves to
  `main`; one on `master` resolves to `master`.
- `refs/remotes/origin/HEAD` outranks every local guess.
- `init.defaultBranch` outranks the conventional-name list.
- Two conventional trunks present, and nothing else stable: it declines
  rather than picking a side.
- A declared `branches.integration` still wins over all of it.
- The guard in a consumer project on `main` says `committing directly to
  \`main\`` and never `git switch develop`; a project that declared
  `trunk` is still told `git switch trunk`, which it can follow.
- The post-checkout warning still fires when the shared checkout
  wanders — the test that refused the first design passes.

### the lint that flagged its own fix

`lint:no-hardcoded-branch-names` — added by x00589 for exactly this
defect — refused `CONVENTIONAL_TRUNKS`, and formally it was right: those
are branch names in source.

It is the same distinction x00595 had to teach the brand sweep.
Everywhere else a branch name in source is this project's habit leaking
into somebody else's repository. Here the names are the **payload**: a
list of what other projects call their trunk, read only to RECOGNISE
one, never to assume it. The file is waived, and only that file, with
the reason written where the next reader will find it.

## risks and mitigations

- **A project with no remote whose trunk is unconventional.** Nothing
  stable says, so the policy keeps `develop` and the project is expected
  to declare `branches.integration`. Pinned by a test, so the behaviour
  is a decision rather than an accident.
- **A repository where `origin/HEAD` is stale.** It is the forge's own
  statement and `git remote set-head` refreshes it; a declared branch
  still outranks it.
