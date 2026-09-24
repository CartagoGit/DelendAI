---
id: x00626
title: "delendai governs agents; a person uses git freely"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-24
---

# x00626 — delendai governs agents; a person uses git freely

## goal

The development policy governs agents. An agent may not stash, may not
create a branch outside the policy's namespaces, and may not commit or
push where the policy forbids it, and git itself refuses these, for every
runtime that drives git. A person using their own repository is never
refused or nagged by delendai: they branch, commit, push and stash as
they always could, and whatever the forge enforces is the repository
owner's own rule.

## why

- **A stash appeared in the operator's graph** (`stash@{0}: WIP on (no
  branch)`), created by an agent while switching a detached worktree. The
  rule against agent stashes was prose in the bootstrap and an advisory
  lint that reported after the fact. `refs/stash` is one stack shared by
  every worktree of a repository, so work an agent stashes belongs to
  nobody: another agent can pop it, `git stash clear` anywhere deletes
  it, and nothing in the work model can see it.
- **The installed guard judged everyone.** A project that installed
  `delendai guard` had a person's `git switch -c feature/x`, direct
  commit, or stash refused exactly like an agent's. The operator's
  principle: delendai is for agents, not for limiting how anybody uses a
  repository.
- **The guard could not be installed next to lefthook at all**, so this
  repository never had the git-level refusal, and adding it through
  lefthook printed a banner on every ref update, i.e. on every git
  command.
- **The stash check was incomplete.** The transaction hook judged only
  ref *creations*. A second stash updates `refs/stash`, so every stash
  after the first would have passed.

## why this design

- **One judge, with the actor as a required argument.**
  `judgeGitOperation(policy, operation, actor)`. With no agent marker in
  the environment of the process running git, the answer is always
  "allowed". Every caller has to say who is acting.
- **One list of what an agent looks like**, `AGENT_ENVIRONMENT_MARKERS`
  (`DELENDAI_AGENT_ID`, `AI_AGENT`, `CLAUDECODE`), read by one helper.
  Only observed markers are listed. Any runtime can identify itself
  through `DELENDAI_AGENT_ID`, which is also what names its work refs. An
  agent whose runtime sets no marker and no `DELENDAI_AGENT_ID` is
  indistinguishable from a person; that is the honest limit.
- **Git refuses, not a lint.** `reference-transaction`, in its
  `prepared` state, sees every write to `refs/stash` and aborts it for an
  agent. Its plain-shell filter starts the CLI only for a branch creation
  or a stash write, so fetches and commits pay nothing and print nothing.
- **Installed alongside a hook manager, not against it.** Under lefthook,
  the hooks it declares stay its own (unchanged: "add the guard to
  lefthook.yml"); a hook it does not declare is written to `.git/hooks`,
  which is never committed. `--alongside-manager` makes that the success
  case, and this repository's `prepare` uses it.

## non-goals

- Installing anything a project did not ask for. Starting a server still
  writes nothing; the guard is installed by `delendai guard install` or a
  project's own `prepare`.

## Slices

- global_gate: none

### S1 — The judge governs agents only, and refuses an agent's stash

- **Status**: done — `git-guard.spec.ts` states its actor on every case,
  and pins that a person may stash, branch, commit and push under every
  profile.
- **Gate**: `npx vitest run packages/core/tests/src/lib/development-policy packages/core/tests/src/lib/work-identity`
- **Files**: `packages/core/src/lib/contracts/interfaces/git-guard.interface.ts`,
  `packages/core/src/lib/contracts/constants/agent-environment.constant.ts`,
  `packages/core/src/lib/work-identity/agent-environment.helper.ts`,
  `packages/core/src/lib/development-policy/git-guard.ts`,
  `packages/core/src/cli.ts`,
  `packages/core/tests/src/lib/development-policy/git-guard.spec.ts`,
  `packages/core/tests/src/lib/work-identity/agent-environment.helper.spec.ts`

### S2 — Git sees every stash write, and the hook stays silent

- **Status**: done — proved with real git: an agent's first stash and a
  stash on top of an existing one are both refused, the work stays in
  the tree, `stash drop` still works, and a person's stash succeeds.
- **Gate**: `npx vitest run packages/cli/src/lib/guard-hooks.service.spec.ts packages/cli/src/commands/guard.command.spec.ts packages/core/tests/src/lib/guard-hooks`
- **Files**: `packages/cli/src/commands/guard.command.ts`,
  `packages/cli/src/commands/guard.command.spec.ts`,
  `packages/core/src/lib/guard-hooks/guard-hook-block.helper.ts`,
  `packages/core/tests/src/lib/guard-hooks/guard-hook-block.helper.spec.ts`,
  `packages/cli/src/lib/guard-hooks.service.spec.ts`
- The existing real-git refusal test inherited an agent marker from
  whoever ran it, so in CI it would have run as a person. Both halves now
  state their environment.

### S3 — Installed next to lefthook, including in this repository

- **Status**: done — in a throwaway project with a `lefthook.yml` and its
  own `pre-commit`, `guard install --alongside-manager` exits 0, leaves
  `pre-commit` untouched, and installs `reference-transaction`.
- **Gate**: `npx vitest run packages/cli/src/lib/guard-hooks.service.spec.ts`
- **Files**: `packages/cli/src/lib/guard-hooks.service.ts`,
  `package.json`,
  `tools/scripts/lint/no-stashes.script.ts`,
  `tools/scripts/gen/agent-md-rules.ts`
- The stash advisory in pre-commit now speaks only to agents, and the
  agent rule says git refuses the stash instead of "this repo forbids
  it".

## acceptance

- An agent's `git stash` is refused by git, with the reason and what to
  do instead, in any runtime that marks its shell.
- A person's stash, branch, commit and push are never refused by
  delendai.
- No banner or output on ordinary git operations.
