---
name: mcp-vertex-proposals-workflow-playbook
appliesTo: ['@mcp-vertex/proposals']
description: Canonical compact workflow for agents working through the proposals plugin: orient, select work, claim files, implement, validate, close, and sync without polling or hand-editing generated state.
---

# proposals workflow playbook

Use this when a session needs to advance proposal work through MCP tools.
It is the compact entrypoint; `mcp-vertex-proposal-swarm-runner` has the longer
background.

## Decision Tree

```
mcp-vertex_overview { compact: true }
  -> proposals_auto_work {}
  -> proposals_continue_proposal { id, mode: "plan" }
  -> proposals_agent_lock { action: "claim", files }
  -> edit only the claimed files
  -> run the slice gate, usually bun run validate
  -> proposals_close_slice { id, sliceId }
  -> proposals_sync_proposals after the final slice/status move
```

## Persist Modes

`auto_work` can plan persistence, but the default is still manual review:

First, read `mcp-vertex.config.json#agentWorktree` (or the `--agent-worktree`
CLI flag). If `false`/unset — do not call `proposals_agent_worktree`; commit
to the active branch instead. The `agent_worktree` path below applies only
when the host has enabled the capability.

- `none`: default for CI, audits, and any shared worktree.
- `commit`: local single-agent work after a focused diff review.
- `commit-and-push`: only inside a disposable `agent_worktree` (requires the
  host gate enabled).

Do not infer a commit mode from enthusiasm. Pick the cheapest mode that
preserves ownership.

## Waiting

Do not poll lock status in a loop. If a claim fails because another agent
owns the files, wait for `notification_await_lock` or the
`lock-released` notification, then retry once with the same file scope.

## Never Do

1. Do not loop on `agent_lock status`.
2. Do not push from a shared checkout without `agent_worktree` (when the host
   has enabled it; if `agentWorktree` is `false`/unset, commit to the active
   branch instead — the tool is disabled by host configuration).
3. Do not edit `docs/proposals/index.json` by hand.
4. Do not run `proposals_sync_proposals` as a substitute for closing the
   current slice or moving the proposal file.

## Smoke

`mcp-vertex_knowledge` with no `id` should list entries, and
`proposals_auto_work` should either return a claimable slice/proposal or
an explicit idle reason. A silent empty response is a host assembly bug,
not a valid workflow state.

## Plans (q00001)

A `type: plan` proposal (prefix `q`) is an **orchestrator container** that
groups other proposals and/or carries its own executable slices. A plan
cannot close (`status: done`) until every contained proposal, sub-plan
and own slice is `done` + peer-reviewed.

### Working with a plan

1. Use `proposals_continue_proposal { planId: "q00001", mode: "plan" }`
   to inspect its `## Slices` section and the `contains:` block.
2. For each contained proposal, claim + close its slices as usual.
3. For own slices, claim them via `agent_lock` like any other slice.
4. When every child is done, call
   `proposals_close_plan { planId: "q00001", reason: "..." }`. The tool
   runs the closure preflight; if any child is still open, it returns a
   list of `blockers[]` you must resolve first.
5. `proposals_proposal_transition { id: "q00001", to: "done" }` also
   enforces the same rule (defence in depth) — both surfaces share the
   `evaluatePlanClosure` engine so they can never disagree.

### Sub-plans

A plan's `contains.plans[]` may reference other plans. The closure
evaluator recurses with cycle detection — a self-reference
(`q00001 → q00002 → q00001`) surfaces a `self-cycle` blocker instead of
infinite-looping.

### Minimal template

```yaml
---
id: q00042
type: plan
status: ready
track: my-area
contains:
    proposals:
        - { id: f00100, required: true }
        - { id: f00101, required: true }
    slices:
        - { id: qs1, title: "Build the dashboard" }
closureGate:
    requirePeerReview: true
    requireAllSlicesDone: true
    requireAllChildrenDone: true
globalGate: type
---

# q00042 — My orchestration plan

## goal

Ship f00100 and f00101 atomically as a single plan, with one extra
dashboard slice on top.

## Slices

### qs1 — Build the dashboard
- files: [apps/web/src/pages/plans/q00042.astro]
- gate: type
- status: pending
```
