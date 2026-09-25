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

- **Status**: in-progress
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/caller-checkout-tools.spec.ts plugins/proposals/tests/src/lib/tools/write-roots.spec.ts`
- **Files**: `packages/core/src/lib/shared/shared-checkout.ts`,
  `plugins/proposals/src/lib/services/scope-to-caller.service.ts`,
  `plugins/proposals/src/lib/shared/git-runner.ts`,
  `plugins/proposals/src/lib/tools/authoring.tool.ts`,
  `plugins/proposals/src/lib/tools/auto-fix-queue.tool.ts`,
  `plugins/proposals/src/lib/tools/close-plan.tool.ts`,
  `plugins/proposals/src/lib/tools/incident-proposal.tool.ts`,
  `plugins/proposals/src/lib/tools/recovery-tools.ts`,
  `plugins/proposals/src/lib/tools/sync-proposals.tool.ts`,
  `plugins/proposals/tests/src/lib/tools/caller-checkout-tools.spec.ts`,
  `plugins/proposals/tests/src/lib/tools/write-roots.spec.ts`

`close_slice`, `proposal_review`, `auto_fix_queue`,
`proposals_close_plan`, `incident_proposals`,
`proposal_force_transition`, `proposal_reconcile_folder` and
`sync_proposals` scope their tree paths to the call
(`scopeToCaller`): the proposals directory, its index, the peer-review
journal and the root the SQLite projection is built under move; the id
counter, locks, agent registry and logs stay the repository's. The
plugin's own git runner follows the bound root too.
The binding itself was tightened after the 2026-09-24 external review
of S1: an invalid checkout is refused centrally even for a tool whose
schema declares `checkout` (a field is not proof the handler checks it),
and a `caller-checkout` tool whose input cannot carry `checkout` fails
to register instead of running unbound.

`inherit_host_instructions` stays `server` and moves to S4: it reads the
host files through a reader built at registration, so moving only its
writes would read one tree and write another.

### S3 — commit-policy follows the caller

- **Status**: in-progress
- **Gate**: `npx vitest run plugins/commit-policy/tests/src/lib/tools/commit-tool.spec.ts plugins/commit-policy/tests/src/lib/tools/run-tool.spec.ts`
- **Files**: `plugins/commit-policy/src/lib/tools/commit-tool.ts`,
  `plugins/commit-policy/src/lib/tools/run-tool.ts`,
  `plugins/commit-policy/tests/src/lib/tools/commit-tool.spec.ts`,
  `plugins/commit-policy/tests/src/lib/tools/run-tool.spec.ts`

`commit_policy_commit` acts through core's git runner, which already
follows the bound root: declared `caller-checkout`, with a test that
commits from a linked worktree onto its branch and leaves the server's
branch alone. `commit_policy_run` also reads the slice snapshot from
`workspaceRoot`, so its handler scopes that root to the call; a test
shows it finding a slice only the worktree's index has. The agent lock
stays the repository's.

### S4 — issues, triage, host instructions and core's own write tools follow the caller

- **Status**: in-progress
- **Gate**: `npx vitest run packages/core/tests/src/lib/shared/bind-write-root.spec.ts packages/core/tests/src/lib/scaffold/project-plugins-behaviour.spec.ts plugins/issues/tests/src/lib/tools/resolve-issue.tool.spec.ts plugins/issues-triage/tests/proposal-paths.service.spec.ts plugins/proposals/tests/src/lib/tools/caller-checkout-tools.spec.ts`
- **Files**: `packages/core/src/lib/shared/shared-checkout.ts`,
  `packages/core/src/lib/shared/fs-tools.ts`,
  `packages/core/src/lib/cli/assemble-core-tools.ts`,
  `packages/core/src/lib/scaffold/scaffold-tool.ts`,
  `packages/core/src/lib/scaffold/create-plugin.tool.ts`,
  `packages/core/src/lib/scaffold/project-plugins.ts`,
  `plugins/issues/src/lib/tools/index.ts`,
  `plugins/issues/src/lib/tools/analyze-issue.tool.ts`,
  `plugins/issues/src/lib/tools/ingest-issue.tool.ts`,
  `plugins/issues/src/lib/tools/resolve-issue.tool.ts`,
  `plugins/issues-triage/src/index.ts`,
  `plugins/issues-triage/src/lib/proposal-paths.service.ts`,
  `plugins/issues-triage/src/lib/tools/triage.tools.ts`,
  `plugins/proposals/src/index.ts`,
  `plugins/proposals/src/lib/tools/inherit-host-instructions.tool.ts`,
  the specs in the gate, and the specs that pin these declarations.

Two per-call primitives in `callerCheckout`: `workspaceForCall` (a
workspace provider whose `root` and `resolve` follow the bound call)
and `pathForCall` (a registration-time path, read per call through a
getter). Core binds its own tools where it assembles them, and hands
scaffold, `create_plugin` and the `project_plugins` tools the call-scoped
workspace; `fs_write` reads the execution root. The scaffold's batch
writer is now built per call — built once, it would have written every
call's files into the server's root. The issues tools read their
scaffold directory per call, triage its proposals directory (the id
counter stays the repository's), and `inherit_host_instructions` reads
the host files and writes its proposal in the caller's tree. After this
slice every write tool declared `caller-checkout` is shown by a test to
act there.

## acceptance

- A `caller-checkout` tool called with a worktree acts in that worktree:
  proven for `git_commit` by a commit that lands on the worktree's
  branch and leaves the server's branch untouched.
- No tool declares `caller-checkout` unless a test shows it acting in
  the named checkout.
- A `caller-checkout` tool is always bindable, always centrally
  validated, and always runs under the resolved root.
