# Stable API (f00152 S2 — L4)

The **Stable API Surface** is a small, named subset of tools that the
`@delendai/core` project guarantees will not break on a minor or
patch release. Tools outside the fence may change shape, name, or
vanish on any release. Tools inside the fence can only be removed
after a two-release deprecation cycle.

## What "stable" means here

- **Additive-only**: fields may be added to a facade tool's
  `inputSchema` or `outputSchema`, never renamed or removed, without
  bumping the major.
- **One-release compat window**: when a facade tool needs a breaking
  change, the old shape is translated at the handler boundary for
  one release. The response carries a structured
  `deprecatedShapeUsed` warning with `sinceVersion`, `removedIn`,
  and `migrationHint`.
- **Two-release deprecation cycle** for removal: a facade tool can
  only be removed in the release that follows the release where it
  was first marked `@deprecated`.
- **Machine-readable manifest**: `docs/delendai/api/stable.json` is
  the canonical source of truth for the facade's shape. Run
  `bun run build:stable-manifest` to regenerate.

## The nine facade tools

| Tool | Plugin | Summary |
| --- | --- | --- |
| `proposal_transition` | proposals | Move a proposal to a new status against the DFA. |
| `proposal_create` | proposals | Create a new proposal document with frontmatter + slices. |
| `auto_work` | proposals | Resolve the next proposal slice and return an action plan. |
| `agent_lock` | proposals | Claim file ownership for an agent (cross-process lock). |
| `agent_worktree` | proposals | Create or manage per-agent git worktrees. |
| `proposal_review` | proposals | Submit/approve/request-changes on a proposal in review. |
| `task_queue_enqueue` | proposals | Push a task onto the persistent swarm queue. |
| `state_repair` | proposals | Auto-heal stale locks, queue backpressure, orphan assignments. |
| `proposal_force_transition` | proposals | Recovery-path transition (skips peer-review lock). |

## What "stable" does NOT cover

- The MCP transport itself — that's an MCP-level concern.
- Tools outside the fence — anything not in the table above may
  change shape, name, or vanish on any release.
- The non-shape behavior of facade tools (e.g. the DFA transitions
  for `proposal_transition`). The contract is "the input/output
  shape stays stable"; the underlying state machine may still evolve.

## Adding a tool to the facade

Edit `packages/core/src/lib/api/stable-facade.ts`, append a
`describeStableTool({ ... })` entry, then run
`bun run build:stable-manifest` and commit the regenerated manifest.

## Removing a tool from the facade

Mark the descriptor `@deprecated` in a comment for one release,
then remove it on the release that follows. The verifier checks that
the manifest never references a tool the descriptor doesn't list, so
a `sinceVersion` ghost is safe.