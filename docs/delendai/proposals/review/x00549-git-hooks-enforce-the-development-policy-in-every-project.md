---
id: x00549
title: "Git hooks enforce the development policy in every project"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-17
shipped-in:
    - 89d18199d0e0a22779b371eb4daea4c2ab08bdaa
    - e211d28b611f97f76d8ffc12a4d518567fb67074
    - 2fbd2bf7cebe3155efcb9927432b0b98fa63e3ce
    - 35fd715b4e2bcd4c36487a696385a4bdcef62062
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

- **Status**: done — `delendai guard <pre-commit|reference-transaction|pre-push>`
  runs offline (no MCP server, no workspace migration while git holds its
  locks), resolves only a `development` block the project actually
  declares, reads the checked-out branch, `MERGE_HEAD` and the hook's stdin,
  and exits non-zero with the policy's reason and remedy. It judges
  `reference-transaction` only when `prepared` and only for creations. An
  unreadable configuration is reported and enforces nothing. Proven through
  real hooks calling the real CLI in a real repository on
  `shared-checkout-merge`: `git switch -c agent/…`, `git worktree add -b
  agent/…` and a commit on `develop` fail; a `wip/…` branch, a commit on it
  and a merge into `develop` succeed; with no declared policy everything
  goes through. That case caught the configuration being read as the raw
  `parseJsonc` result, which had silently allowed everything.
- **Files**: [`packages/cli/src/commands/guard.command.ts`, `packages/cli/src/commands/guard.command.spec.ts`, `packages/cli/src/commands/guard-facts.spec.ts`, `packages/cli/src/contracts/interfaces/guard.interface.ts`, `packages/cli/src/commands/groups/core.ts`, `packages/cli/src/commands/groups/core.spec.ts`, `packages/cli/src/commands/registry.spec.ts`, `packages/cli/src/index.ts`, `packages/cli/src/index.spec.ts`, `packages/cli/package.json`, `bun.lock`, `vitest.shared.ts`, `tools/scripts/lint/cli-ui-parity.map.json`, `packages/cli/src/contracts/constants/help-translation.constant.ts`]

A CLI entry that git hooks call: `pre-commit`, `reference-transaction` and
`pre-push`. It resolves the project's own policy from its configuration,
reads what git passes (arguments, stdin ref lines), and exits non-zero with
the verdict when refused.

- **Gate**: `npx vitest run packages/cli/src/commands/guard.command.spec.ts`

### S3 — Install the guard beside a project's existing hooks

- **Status**: done — `delendai guard install|uninstall|status`. The hooks
  directory is the one git runs (`git rev-parse --git-path hooks`, so
  `core.hooksPath` such as `.husky` is honoured). The guard is a marked
  block placed first in each of `pre-commit`, `reference-transaction` and
  `pre-push`: it buffers stdin and feeds the same bytes back so the
  project's own hook still reads its input, starts the CLI for
  `reference-transaction` only when a local branch is created, and warns
  and lets git proceed when the runner or CLI entry is gone. Install embeds
  how the installing process reached the CLI (`--runner`/`--entry`
  override), is idempotent, and refreshes a block written for another
  invocation. Uninstall removes exactly the block, and deletes only hook
  files the guard itself created. lefthook and husky v9 (which regenerate
  hook files) and non-shell hooks are reported with what to add by hand,
  and never written into. Proven over real repositories: a plain one; one
  shaped like the observed project (`core.hooksPath=.husky` with existing
  bash `pre-push` and `reference-transaction`), where the project's
  `pre-push` still receives the pushed refs after the guard and both hooks
  are restored byte for byte; and, once installed, a hand-made branch and a
  direct commit are refused.
- **Files**: [`packages/core/src/lib/guard-hooks/guard-hook-block.helper.ts`, `packages/core/src/lib/contracts/interfaces/guard-hooks.interface.ts`, `packages/core/src/lib/contracts/constants/guard-hooks.constant.ts`, `packages/cli/src/contracts/constants/guard-hooks.constant.ts`, `packages/core/src/cli.ts`, `packages/core/tests/src/lib/guard-hooks/guard-hook-block.helper.spec.ts`, `packages/cli/src/lib/guard-hooks.service.ts`, `packages/cli/src/lib/guard-hooks.service.spec.ts`, `packages/cli/src/contracts/interfaces/guard-hooks-service.interface.ts`, `packages/cli/src/commands/guard.command.ts`, `packages/cli/src/commands/guard-facts.spec.ts`, `packages/cli/src/commands/groups/core.ts`]

Resolve the hooks directory (`core.hooksPath`, as husky sets it, or
`.git/hooks`), add a marked block that calls the guard to each hook without
touching what is already there, and remove exactly that block on uninstall.
Idempotent. A hook manager that regenerates hook files (lefthook) is
detected and reported with the configuration to add, rather than written
into and overwritten.

- **Gate**: `npx vitest run packages/cli/src/lib/guard-hooks.service.spec.ts packages/core/tests/src/lib/guard-hooks`

### S4 — A project with a declared policy gets the guard automatically

- **Status**: done — starting the server installs or updates the guard for
  a project whose configuration declares a `development` block, and says
  so on stderr. `development.guardHooks` chooses: `install` (the default),
  `report` (say what is there, write nothing) or `off`. A project that
  declares no policy is left alone, and a repository that cannot take the
  hooks is reported rather than failing the server. Both entries do it:
  `delendai __serve` and this repository's own host script, which is what
  an editor launches in the observed project. The hook is pointed at the
  CLI resolved from the installing module, not at `process.argv[1]` — a
  probe through the host entry had installed hooks that called the server
  script, so a commit straight to the integration branch succeeded with
  the guard "installed". Verified end to end: after a server start, a
  direct commit on `develop` and `git switch -c agent/x` are both refused
  from a plain shell.
- **Files**: [`packages/cli/src/lib/guard-hooks-autoinstall.service.ts`, `packages/cli/src/lib/guard-hooks-autoinstall.service.spec.ts`, `packages/cli/src/contracts/interfaces/guard-hooks-autoinstall.interface.ts`, `packages/cli/src/index.ts`, `packages/cli/src/commands/guard.command.ts`, `packages/cli/src/commands/guard-facts.spec.ts`, `packages/core/src/lib/plugins/development-config-schema.constant.ts`, `packages/core/schema/delendai.config.schema.json`, `tools/scripts/host/host-server.script.ts`]

At startup, a project whose configuration declares a development policy
has the guard installed or updated, and the startup report says so. A
configuration switch turns it off. A project without a declared policy is
left alone.

- **Gate**: `npx vitest run packages/cli/src/lib/guard-hooks-autoinstall.service.spec.ts`

## acceptance

- In a project on `shared-checkout-merge`, `git commit` on the integration
  branch, `git switch -c agent/x` and `git worktree add -b agent/x` all
  fail with the policy's reason, from any shell.
- delendai's own flows (checkpoints to work refs, publication refs) keep
  working under the guard.
- A project's existing hooks keep running and can be restored exactly.
