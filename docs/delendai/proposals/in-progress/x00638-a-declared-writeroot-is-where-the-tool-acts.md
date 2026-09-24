---
id: x00638
title: "A declared writeRoot is where the tool acts"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-24
---

# x00638 — A declared writeRoot is where the tool acts

## goal

`writeRoot` describes behaviour: a tool declared `caller-checkout` reads,
writes and spawns in the checkout the call names, and a tool that cannot
do that yet declares the root it actually writes to.

## why

x00623 made every write tool declare a root, and S4 refuses one that
declares none. An external review on 2026-09-24 pointed out that the
declaration changed nothing at runtime: plugins build their runners once,
from the server's root, so `git_commit` called from an agent's worktree
still committed on the server's branch. Measured the same day: 23 tools
declared `caller-checkout`, and 2 of them (`create_proposal`,
`proposal_transition`) acted in the caller's checkout. The other 21
wrote into the server's root while their declaration said otherwise.

## why this design

- **The root travels with the call, not with the runner.** Runners
  outlive every call, so the root is an `AsyncLocalStorage` scope
  (`execution-root.ts`) opened around the handler. A runner reads
  `executionRootOr(itsOwnRoot)` when it spawns; outside a bound call
  nothing changes.
- **Bound once, where every plugin passes.** `registerPluginWithLifecycle`
  is the funnel for eager and lazy activation. `bindWriteRoot` gives each
  `caller-checkout` tool the one shared `checkout` argument (unless it
  declares its own), resolves it with `resolveWriteRoot` (a working tree
  of this repository, or the server's root) and runs the handler in that
  scope. A checkout from another repository is refused before the handler
  runs.
- **A root that does not follow is not declared.** A tool whose paths are
  fixed at registration would get a `checkout` argument it ignores, or
  worse, run git in one tree and write files in another. Those tools
  declare `server`, where they write today, until a slice makes them
  follow.

## non-goals

- Moving the remaining tools' paths in this slice. Each needs its own
  path rebasing (`callerCheckout.scopePaths`), as `create_proposal`
  already does, and its own test.

## Slices

- global_gate: none

### S1 — Bind the declared root; git commit and deps follow

- **Status**: in-progress
- **Gate**: `npx vitest run packages/core/tests/src/lib/shared/bind-write-root.spec.ts plugins/git/tests/src/lib/write-tools.spec.ts plugins/deps/tests/src/lib/write-tools.spec.ts`
- **Files**: `packages/core/src/lib/shared/execution-root.ts`,
  `packages/core/src/lib/shared/bind-write-root.ts`,
  `packages/core/src/lib/plugins/load-plugins-runtime.helper.ts`,
  `packages/core/src/lib/shared/git-write.ts`,
  `packages/core/src/lib/shared/shared-checkout.ts`,
  `plugins/git/src/lib/services/git.ts`,
  `plugins/deps/src/lib/tools/write-tools.ts`,
  `packages/core/tests/src/lib/shared/bind-write-root.spec.ts`,
  `plugins/git/tests/src/lib/write-tools.spec.ts`,
  `plugins/deps/tests/src/lib/write-tools.spec.ts`, and the tools
  re-declared `server` (listed under S2–S4).

### S2 — The proposals tools follow the caller

- **Status**: pending
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/write-roots.spec.ts`
- **Files**: `close_slice`, `proposal_review`, `auto_fix_queue`,
  `proposals_close_plan`, `incident_proposals`,
  `inherit_host_instructions`, `proposal_force_transition`,
  `proposal_reconcile_folder`, `sync_proposals`: rebase their content
  paths onto the execution root per call, then declare
  `caller-checkout` again.

### S3 — commit-policy follows the caller

- **Status**: pending
- **Gate**: `npx vitest run plugins/commit-policy/tests/src/lib/tools/commit-tool.spec.ts`
- **Files**: `commit_policy_commit`, `commit_policy_run`: the engine is
  built per call from the execution root.

### S4 — issues, triage and core's own write tools follow the caller

- **Status**: pending
- **Gate**: `npx vitest run plugins/issues-triage/tests/triage-tools.spec.ts packages/core/tests/src/lib/scaffold/project-plugins-behaviour.spec.ts`
- **Files**: `issues_analyze`, `issues_ingest`, `issues_resolve`,
  `triage_run`, `fs_write`, `scaffold`, `create_plugin`,
  `project_plugins_*`. Core's own tools are not plugin tools, so they
  need the same binding where core registers them.

## acceptance

- A `caller-checkout` tool called with a worktree acts in that worktree:
  proven for `git_commit` by a commit that lands on the worktree's
  branch and leaves the server's branch untouched.
- No tool declares `caller-checkout` unless a test shows it acting in
  the named checkout.
