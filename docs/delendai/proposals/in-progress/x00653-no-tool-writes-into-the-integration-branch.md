---
id: x00653
title: "No tool writes into the integration branch"
kind: fix
status: in-progress
type: proposal
track: trust
date: 2026-09-25
priority: P0
related: [x00651, x00636, x00650]
---

# x00653 — No tool writes into the integration branch

## goal

Every change a tool makes to the repository's tracked content reaches
the integration branch the canonical way: a work ref, then a pull
request. Nothing writes into the shared checkout while it sits on the
integration branch.

## why

On 2026-09-25 the owner found proposals stuck in `in-progress` whose
work had merged hours earlier. Reproduced the same day:

- `proposal_transition x00647 → review` answered `ok`. The move landed
  in the shared checkout, on `develop`, uncommitted: ` D in-progress/…`
  and `?? review/…`. No ref carried it.
- A reviewer (qwen) recorded its `q00014` verdicts through
  `proposal_review`. They sat on `develop` as an uncommitted edit.
- Seven proposals whose every slice had merged (r00643, x00642, x00647,
  x00648, x00649, x00650, x00652) had never left `in-progress`. Four
  more (x00643, x00645, x00646, x00651) still showed every slice
  `pending` after their pull requests merged.

Such a change is committed by nobody. Agents may not commit to the
integration branch, and no work ref picks it up. It holds the shared
checkout back from being brought level, and it is eventually lost. The
agent that made it saw `ok`.

The cause is one line of behaviour, not one tool. A tool that declares
`writeRoot: 'caller-checkout'` writes where the call's `checkout`
argument says. With no `checkout`, `resolveWriteRoot` falls back to the
server's root. In this project that root is the shared checkout, on
`develop`. Every proposals authoring tool, the transition, the review,
issue ingestion and the deps writers take that fallback.

## why this design

`bindWriteRoot` is the single point every `caller-checkout` tool passes
through, core and plugin alike. It now asks `integrationCheckoutRefusal`,
which reads the project's policy in the one place that already does
(`project-branches.ts`), whether the resolved root is:

- the shared checkout, not a worktree;
- on the integration branch;
- under a policy with a work-ref model.

If it is, the call is refused before the tool runs, with the step that
writes the change canonically: `delendai work enter`, pass that worktree
as `checkout`, then `delendai work publish`.

- A worktree is always allowed. That is where a unit of work lives.
- A project without a work-ref model (`shared-direct`) is untouched: its
  work reaches the integration branch directly, by its own route.
- The shared checkout on any other branch is untouched.
- Nothing about a person's own editing changes. This governs tool
  calls, which is how agents write.

The audit of every write tool found no other route:

- The server already refuses to start a write tool that declares no
  `writeRoot` (`create-mcp-project.ts`).
- The `repository` and `host-state` roots write locks, counters, refs,
  worktrees and state under `.cache`, not tracked content.
- `remote` writes to the forge.

## non-goals

- Writing a tool's change onto a work ref automatically. A refusal that
  names the canonical step is correct today. Doing it for the caller
  needs the caller's unit of work, which the call does not carry.
- Carrying the reviewer's loose `q00014` edit. It is another agent's,
  and that agent is still writing it.

## architecture

- `packages/core/src/lib/development-policy/project-branches.ts`:
  `integrationCheckoutRefusal`.
- `packages/core/src/lib/shared/bind-write-root.ts`: the refusal, before
  the handler runs; injectable for tests.

## Slices

- global_gate: none

### S1 — The finished proposals are handed off through a pull request

- **Status**: review
- **Gate**: `bun run lint:proposals`
- **Files**:
  - `docs/delendai/proposals/review/r00643-proposal-frontmatter-is-parsed-once-as-yaml.md`
  - `docs/delendai/proposals/review/x00642-a-conflict-in-a-derived-file-does-not-stall-the-queue.md`
  - `docs/delendai/proposals/review/x00647-a-test-does-not-expire-with-the-calendar.md`
  - `docs/delendai/proposals/review/x00648-a-published-work-ref-stays-deleted.md`
  - `docs/delendai/proposals/review/x00649-a-red-integration-branch-can-be-repaired-by-the-queue.md`
  - `docs/delendai/proposals/review/x00650-a-stale-red-candidate-gets-one-fresh-verdict.md`
  - `docs/delendai/proposals/review/x00652-an-expiring-exception-warns-before-it-fails.md`

Moved with `proposal_transition`, which wrote into the shared checkout.
The moves were then carried onto this work ref, and the shared checkout
was restored.

### S2 — A write into the integration branch is refused with the canonical step

- **Status**: review
- **Gate**: `npx vitest run packages/core/tests/src/lib/shared/bind-write-root.spec.ts packages/core/tests/src/lib/development-policy/project-branches.spec.ts`
- **Files**:
  - `packages/core/src/lib/development-policy/project-branches.ts`
  - `packages/core/src/lib/shared/bind-write-root.ts`
  - `packages/core/tests/src/lib/development-policy/project-branches.spec.ts`
  - `packages/core/tests/src/lib/shared/bind-write-root.spec.ts`

## dependency graph

None. S1 and S2 are independent.

## acceptance

- A `caller-checkout` tool called without `checkout`, while the server
  runs in the shared checkout on the integration branch under a work-ref
  policy, is refused. The tool never runs, and the refusal names
  `delendai work enter`.
- The same call naming a worktree runs in that worktree.
- The refusal does not apply to a worktree, to the shared checkout on
  another branch, to a project with no declared policy, or to
  `shared-direct`.
- The full `core`, `proposals`, `commit-policy`, `issues`, `deps` and
  `cli` projects pass. No existing flow depended on the fallback.

## risks and mitigations

- **An agent or reviewer that never passes `checkout`.** It is refused
  where it used to lose its work silently. The refusal says exactly what
  to run.
- **The running host keeps the old behaviour** until it restarts on a
  `develop` that carries this change.
