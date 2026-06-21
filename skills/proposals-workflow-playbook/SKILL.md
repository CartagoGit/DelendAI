---
name: proposals-workflow-playbook
description: Canonical compact workflow for agents working through the proposals plugin: orient, select work, claim files, implement, validate, close, and sync without polling or hand-editing generated state.
---

# proposals workflow playbook

Use this when a session needs to advance proposal work through MCP tools.
It is the compact entrypoint; `proposal-swarm-runner` has the longer
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

- `none`: default for CI, audits, and any shared worktree.
- `commit`: local single-agent work after a focused diff review.
- `commit-and-push`: only inside a disposable `agent_worktree`.

Do not infer a commit mode from enthusiasm. Pick the cheapest mode that
preserves ownership.

## Waiting

Do not poll lock status in a loop. If a claim fails because another agent
owns the files, wait for `notification_await_lock` or the
`lock-released` notification, then retry once with the same file scope.

## Never Do

1. Do not loop on `agent_lock status`.
2. Do not push from a shared checkout without `agent_worktree`.
3. Do not edit `docs/proposals/index.json` by hand.
4. Do not run `proposals_sync_proposals` as a substitute for closing the
   current slice or moving the proposal file.

## Smoke

`mcp-vertex_knowledge` with no `id` should list entries, and
`proposals_auto_work` should either return a claimable slice/proposal or
an explicit idle reason. A silent empty response is a host assembly bug,
not a valid workflow state.
