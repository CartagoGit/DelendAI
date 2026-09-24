---
id: x00623
title: "A write declares which tree it belongs to"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-23
shipped-in: ["088361e5e", "a25428a05", "218646867", "532b4a072", "bf1814f1a", "1d1df0b29", "280f2b2c1"]
---

# x00623 — A write declares which tree it belongs to

## goal

Every tool that writes declares *where* its writes belong. The server
resolves that place per request from one resolver, instead of each tool
reaching for the root the server was started with. A write can then land
in the wrong tree only if someone declared it wrong in one place.

## why

x00608 found this in two proposal tools. An agent in its own worktree
called `proposal_transition`, got `ok`, and the rename happened in the
shared checkout on the integration branch. x00608 fixed those two tools
and added `callerCheckout`, one resolver that proves a path is a working
tree of this repository (shared git common directory) and moves a
tool's paths with it.

The class is wider than two tools. `develop` at `d43f019df` has 74 tool
registrations with a `write` effect, across 14 packages (proposals 18,
core 8, commit-policy 5, issues 3, forge 3, and others). Every one
resolves its paths from the composition root, and nothing records which
of four different places the author meant:

| Root | Meaning | Example |
| --- | --- | --- |
| `caller-checkout` | the working tree the calling agent is in | a proposal rename, a generated file |
| `repository` | a fact about the whole repository, the same from every worktree | the proposal id counter, the agent lock |
| `host-state` | state outside any working tree | caches, the SQLite projection, journals |
| `server` | the server's own root, deliberately | its own configuration |

The difference matters exactly when an agent works in a worktree, which
is the model this project recommends. A counter rooted per worktree
hands out the same id twice; a rename rooted at the server lands on the
integration branch. Today the distinction lives in the heads of
whoever wrote each tool. It belongs in a declaration.

This is the order the external review asked new invariants to follow:
a type the author has to fill in first, then runtime resolution, and
only then a check for the ones that are missing.

## why this design

- `IToolEffect` already says *that* a tool writes. A `writeRoot` beside
  it says *where*, in the same registration, where reviewers already
  look. It is not optional for a `write` tool, because an omitted root is
  the current bug.
- Resolution goes through `callerCheckout`, so there is still one
  definition of "a working tree of this repository". `repository` resolves
  through `sharedCheckout`, the existing answer for facts shared by all
  worktrees.
- The request argument stays `callerCheckout.arg`, one spelling across
  the catalog. Only `caller-checkout` tools declare it, so read-only
  tools and host-state tools pay nothing in schema bytes.

## non-goals

- Changing what any tool writes.
- Letting a request move a `repository` or `host-state` write. Those
  roots are not the caller's to choose.

## Slices

- global_gate: none

### S1 — The registration declares a write root

- **Status**: done
- **Gate**: `npx vitest run packages/core/tests/src/lib/shared/write-root.spec.ts`
- **Files**: `packages/core/src/lib/contracts/interfaces/tool-registration.interface.ts`,
  `packages/core/src/lib/shared/shared-checkout.ts`,
  `packages/core/tests/src/lib/shared/write-root.spec.ts`
- `IToolWriteRoot = 'caller-checkout' | 'repository' | 'host-state' |
  'server'`, and `writeRoot` on the registration. One resolver takes the
  root, the server's root and the request, and returns the directory to
  write in, refusing a caller checkout that is not a working tree of this
  repository. A spec covers each root, including from a linked worktree.
- Published as `callerCheckout.writeRoot`, inside the existing facade,
  so the public surface does not grow; `IToolWriteRoot` is reachable as
  `IToolRegistration['writeRoot']`.

### S2 — The proposal tools declare their roots

- **Status**: done
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools`
- **Files**: `plugins/proposals/src/lib/tools/agent-lock.tool.ts`,
  `plugins/proposals/src/lib/tools/agent-names.tool.ts`,
  `plugins/proposals/src/lib/tools/agent-worktree.tool.ts`,
  `plugins/proposals/src/lib/tools/authoring.tool.ts`,
  `plugins/proposals/src/lib/tools/auto-fix-queue.tool.ts`,
  `plugins/proposals/src/lib/tools/branch-gc.tool.ts`,
  `plugins/proposals/src/lib/tools/close-plan.tool.ts`,
  `plugins/proposals/src/lib/tools/continue-proposal.tool.ts`,
  `plugins/proposals/src/lib/tools/incident-proposal.tool.ts`,
  `plugins/proposals/src/lib/tools/inherit-host-instructions.tool.ts`,
  `plugins/proposals/src/lib/tools/orchestration.tool.ts`,
  `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`,
  `plugins/proposals/src/lib/tools/recovery-tools.ts`,
  `plugins/proposals/src/lib/tools/round-context.tool.ts`,
  `plugins/proposals/src/lib/tools/state-tools.tool.ts`,
  `plugins/proposals/src/lib/tools/sync-proposals.tool.ts`,
  `plugins/proposals/src/lib/tools/task-queue.tool.ts`,
  `plugins/proposals/tests/src/lib/tools/write-roots.spec.ts`
- The 21 write tools of the heaviest plugin (18 when the proposal was
  written) declare their roots.
  `proposal_transition` and `create_proposal` move from their x00608
  special case to the shared resolver, with behaviour unchanged.
- Roots: proposal files in `caller-checkout` (create, close, review,
  transition, plan close, incident and auto-fix drafts, host-instruction
  audit, force transition, folder reconcile, sync); locks, worktrees,
  branches and claims in `repository`; registries, queues and digests in
  `host-state`. `write-roots.spec.ts` reads the real registration.

### S3 — The already-covered write tools declare their roots

- **Status**: done (#398)
- **Gate**: `bun run lint:architecture`
- **Files**: `packages/core/src/lib/metrics/metrics-tool.ts`,
  `packages/core/src/lib/scaffold/scaffold-tool.ts`,
  `packages/core/src/lib/shared/fs-tools.ts`,
  `plugins/browser/src/lib/tools/browser-inspect.tool.ts`,
  `plugins/commit-policy/src/lib/tools/run-tool.ts`,
  `plugins/commit-policy/src/lib/tools/settlement-tool.ts`,
  `plugins/commit-policy/src/lib/tools/work-ref.tool.ts`,
  `plugins/completion/src/lib/tools/completion-tools.ts`,
  `plugins/deps/src/lib/tools/write-tools.ts`,
  `plugins/external-mcps/src/lib/tools/ack.tool.ts`,
  `plugins/forge/src/lib/tools/forge-release.tool.ts`,
  `plugins/forge/src/lib/tools/forge-write.tool.ts`,
  `plugins/git/src/lib/tools/write-tools.ts`,
  `plugins/github/src/lib/tools/write-tools.ts`,
  `plugins/issues/src/lib/tools/analyze-issue.tool.ts`,
  `plugins/issues/src/lib/tools/ingest-issue.tool.ts`,
  `plugins/issues/src/lib/tools/resolve-issue.tool.ts`,
  `plugins/memory/src/lib/tools/compact.tool.ts`,
  `plugins/orchestrator-runner/src/lib/tools/bootstrap.tool.ts`,
  `plugins/orchestrator-runner/src/lib/tools/healthcheck-providers.tool.ts`,
  `plugins/usage-tracking/src/lib/tools/clear.tool.ts`
- 27 registrations in 21 files. A fifth root, `remote`, was added to S1
  before it merged: forge, GitHub, GitLab and issue-triage writes land on
  a remote service. Working-tree writes are `caller-checkout`; refs
  `repository`; records, caches, health and screenshots `host-state`.
- The first attempt (#393) declared all 29 files at once and came in
  under the changed-file coverage floors (61% functions): eight of them
  have little or no test coverage. Those are S5, with their tests.

### S5 — The remaining write tools declare their roots, with the tests they lacked

- **Status**: done (#399, #400, #401, #402)
- **Gate**: `bun run lint:architecture`
- **Files**: `packages/core/src/lib/scaffold/create-plugin.tool.ts`,
  `packages/core/src/lib/scaffold/project-plugins.ts`,
  `plugins/commit-policy/src/lib/tools/commit-tool.ts`,
  `plugins/commit-policy/src/lib/tools/push-tool.ts`,
  `plugins/gitlab/src/lib/tools/write-tools.ts`,
  `plugins/issues-triage/src/lib/tools/triage.tools.ts`,
  `plugins/memory/src/lib/tools/tools.ts`
- Each file is brought over the changed-file coverage floors by specs of
  its own behaviour before its registration gains a root. S4 depends on
  this slice.
- Shipped as four pull requests: the dead copy deleted (#399); the core
  project-plugin and create-plugin tools (#400); commit-policy commit and
  push (#401); issue triage, GitLab writes and memory (#402). Each file
  reached the changed-file coverage floors through specs of its own
  behaviour before its registration gained a root, except
  `author-external-plugin.ts`: a dead, near-exact copy of
  `project-plugins.ts` that nothing imported, deleted instead.

### S4 — A write tool without a root does not register

- **Status**: done
- **DependsOn**: [S5]
- **Gate**: `npx vitest run packages/core/tests/src/lib/tools`
- **Files**: `packages/core/src/lib/project/create-mcp-project.ts`,
  `packages/core/tests/src/lib/project/create-mcp-project.spec.ts`
- A registration with a `write` effect and no `writeRoot` is refused when
  the registration sequence is planned (`planRegistrationOrder`). That makes this a type-and-runtime
  invariant, not a new textual lint.
- A registration with a `write` effect and no `writeRoot` makes
  `planRegistrationOrder` throw, naming every such tool and the five
  roots to choose from, so a host fails at start-up. This includes
  third-party plugins: a write tool that does not say where it writes is
  the defect, whoever wrote it.

## acceptance

- Every `write` registration declares a root. A missing one fails at
  registration, not in review.
- From a linked worktree, a `caller-checkout` write lands in that
  worktree, a `repository` write lands in the shared checkout's
  repository state, and neither touches the integration branch's
  working tree.
- The catalog grows by the `checkout` argument only on
  `caller-checkout` tools.
