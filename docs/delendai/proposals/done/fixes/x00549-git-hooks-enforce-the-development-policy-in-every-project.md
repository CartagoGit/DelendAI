---
id: x00549
title: "Git hooks enforce the development policy in every project"
kind: fix
status: done
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

- **Status**: done
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
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Implementer unrecorded: independence cannot be verified; reviewed identically to a recorded delivery. Read the full diff of 89d18199d (6 files, exactly the declared set: git-guard.ts +152, git-guard.interface.ts +28, cli.ts export +8, git-guard.spec.ts +184, the proposal doc and one bootstrap line). Verified: (1) judgeGitOperation reads the RESOLVED development policy and refuses exactly the three operations the proposal names — direct integration commits, branches outside the policy namespaces under a pinned checkout, pushes that skip pull requests; with no policy nothing is refused (non-goal 'no new policy' held — every refusal is a reading of the resolved policy); (2) exported on @delendai/core/cli; (3) remote-tracking refs, tags and updates to existing branches are not judged (third non-goal); (4) gate run verbatim: npx vitest run packages/core/tests/src/lib/development-policy/git-guard.spec.ts = 26/26 exit 0. bun run typecheck exit 0.
- review-attribution: unrecorded — nothing in Git names who delivered 89d18199d0e0a22779b371eb4daea4c2ab08bdaa: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
### S2 — `delendai guard <hook>` runs the judge from a git hook

- **Status**: done
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
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Implementer unrecorded: independence cannot be verified; reviewed identically to a recorded delivery. The queue named the S1 commit for every slice; git log traces S2 to e211d28b6, diff read (7 files: guard.command.ts +188, guard.command.spec.ts +244, guard.interface.ts, registry, index, vitest.shared.ts, the proposal doc — all within the declared Files). Verified: (1) `delendai guard <pre-commit|reference-transaction|pre-push>` runs offline (no MCP server, no workspace migration while git holds locks), resolving only a development block the project actually declares; (2) reference-transaction is judged only when 'prepared' and only for branch creations — matching the non-goal that updates/tags stay untouched; (3) an unreadable configuration is reported and enforces nothing (fail-open with a visible report, the safe direction for a hook); (4) the commit documents end-to-end proof through REAL hooks on shared-checkout-merge calling the real CLI: switch -c agent/… refused, worktree add -b agent/… refused, commit on develop refused, wip/ branch + merge into develop accepted, no-policy everything passes — acceptance bullet 1 evidenced not just spec'd, and the exercise caught a real defect (raw parseJsonc read had silently allowed everything); (5) gate run verbatim: npx vitest run packages/cli/src/commands/guard.command.spec.ts = 18/18 exit 0 (plus guard-facts.spec.ts inside the same suite run, green). bun run typecheck exit 0.
- review-attribution: unrecorded — nothing in Git names who delivered e211d28b611f97f76d8ffc12a4d518567fb67074: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
### S3 — Install the guard beside a project's existing hooks

- **Status**: done
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
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Implementer unrecorded: independence cannot be verified; reviewed identically to a recorded delivery. The queue named the S1 commit; git log traces S3 to 2fbd2bf7c, diff read (11 files, all within the declared Files — the block file landed as guard-hook-block.ts with a later rename to .helper.ts per the repo convention; both specs exist). Verified: (1) `delendai guard install|uninstall|status` writes a marked block FIRST in pre-commit, reference-transaction and pre-push, in the hooks directory git actually runs (git rev-parse --git-path hooks, so core.hooksPath like .husky is honoured); (2) non-goal 'no clobbering' is implemented, not just stated: the block buffers stdin and feeds the same bytes back so the project's own hook still reads its input; uninstall removes exactly the block and deletes only hook files the guard created, restoring byte-for-byte; lefthook, husky v9 and non-shell hooks are REPORTED with what to add by hand and never written into; when delendai is gone the block warns and lets git proceed (no bricking); (3) acceptance bullet 3 (existing hooks keep running and can be restored exactly) is proven over real repositories per the commit: a plain one, and one shaped like the observed project (core.hooksPath=.husky with existing pre-push and reference-transaction) where the project's pre-push still receives pushed refs after the guard; (4) gate run verbatim: npx vitest run packages/cli/src/lib/guard-hooks.service.spec.ts packages/core/tests/src/lib/guard-hooks = 17/17 exit 0. bun run typecheck exit 0.
- review-attribution: unrecorded — nothing in Git names who delivered 2fbd2bf7cebe3155efcb9927432b0b98fa63e3ce: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
### S4 — A project with a declared policy gets the guard automatically

- **Status**: done
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
- review-state: done
- review-implementer: unrecorded
- review-reviewer: qwen-3.8-max
- review-log: approved by qwen-3.8-max — Implementer unrecorded: independence cannot be verified; reviewed identically to a recorded delivery. The queue named the S1 commit; git log traces S4 to 35fd715b4, diff read (8 files, exactly the declared Files set). Verified in the current tree: (1) guard-hooks-autoinstall.service.ts exists — server start installs or updates the guard for projects whose config declares a development block and says so on stderr; (2) development.guardHooks is a declared tri-state enum install|report|off in development-config-schema.constant.ts:48 and delendai.config.schema.json:132, default install; (3) both entries do it: packages/cli/src/index.ts (__serve) and tools/scripts/host/host-server.script.ts (line 260 shows the report-never-fatal path: 'guard hooks were not inspected' on error without failing the server) — a repository that cannot take the hooks is reported, never fatal, and a project without a policy is untouched (non-goal 'no new policy' held); (4) the commit documents the defect the probe caught and fixed: hooks must call the CLI resolved from the installing module, not process.argv[1], otherwise a 'installed' guard wrote hooks calling the server script and direct commits still succeeded; after the fix a direct commit on develop and git switch -c agent/x are refused from a plain shell (acceptance bullet 1 end-to-end); (5) gate run verbatim: npx vitest run packages/cli/src/lib/guard-hooks-autoinstall.service.spec.ts = 9/9 exit 0. bun run typecheck exit 0. Acceptance bullet 2 (delendai's own checkpoint/publication flows keep working under the guard) is exercised every session on this machine — this reviewer's own work enter/checkpoint/publish ran through the guarded repo today without a refusal.
- review-attribution: unrecorded — nothing in Git names who delivered 35fd715b4e2bcd4c36487a696385a4bdcef62062: no work ref of this project in its message or in the merge that brought it into develop, and no Co-Authored-By trailer; independence could not be verified, opened by qwen-3.8-max
## acceptance

- In a project on `shared-checkout-merge`, `git commit` on the integration
  branch, `git switch -c agent/x` and `git worktree add -b agent/x` all
  fail with the policy's reason, from any shell.
- delendai's own flows (checkpoints to work refs, publication refs) keep
  working under the guard.
- A project's existing hooks keep running and can be restored exactly.
