---
name: proposal-swarm-runner
description: The proposals-plugin workflow for an agent that is implementing a slice — claim, implement, validate, close — without polling locks or editing the index by hand. Use whenever overview's recommendedNextAction points at a proposals_* tool.
---

# proposal swarm runner

Read this after `mcp-vertex-operator` once `overview` points you at the
`proposals` plugin. It covers the single-agent loop; for coordinating with
*other* agents in the same repo, read `concurrency-patterns` next.

## Decision tree

```
overview → recommendedNextAction mentions proposals
  → proposals_auto_work { compact: true }
      → tells you the next slice/proposal to work on, or that there is none
  → proposals_continue_proposal { mode: 'plan' }
      → returns the slice's files + acceptance criteria
  → proposals_agent_lock { action: 'claim', files: [...] }
      → ok:true  → implement the slice
      → ok:false (lock-conflict) → see mcp-vertex-failure-modes, do NOT poll
  → implement + test + run the gate (bun run validate)
  → proposals_close_slice { id, sliceId }
      → flips status + releases the lock atomically
```

## `auto_work` persist modes

`plugins/proposals/src/lib/tools/auto-work-persist.ts` defines
`IAutoWorkPersistMode = 'none' | 'commit' | 'commit-and-push'`:

- **`'none'`** (the hard default) — no git interaction at all. Correct for
  CI runs and for any session where the caller wants to inspect the diff
  before committing.
- **`'commit'`** — `git add <files> && git commit -m <message>`. Correct
  for a local, single-agent session where you trust the working tree.
- **`'commit-and-push'`** — the above + `git push`. Only correct when the
  agent is running inside a disposable `agent_worktree` (a branch + worktree
  created specifically for this slice) — pushing directly from the main
  checkout risks clobbering a peer's in-flight branch.

## The 4 "never do"s of the swarm

1. **Never poll `agent_lock { action: 'status' }` in a loop.** Locks are
   notification-driven: wait for the `lock-released` push (notification
   plugin) or for `await_lock`, then retry the claim once.
2. **Never `git push` directly without an `agent_worktree`.** A bare push
   from a shared checkout can overwrite a concurrent agent's branch; the
   worktree isolates your branch until you are ready to merge.
3. **Never edit `docs/proposals/index.json` by hand.** It is a generated
   index; hand edits drift from the `.md` files it indexes the moment
   anyone runs `proposals_sync_proposals`. Move/edit the proposal `.md`
   file and let sync regenerate the index entry.
4. **Never call `proposals_sync_proposals` before closing the last open
   slice of a proposal.** Syncing mid-flight can race a peer's concurrent
   close and produce a transient inconsistent index; close every slice
   first, sync last.

## Smoke

After `proposals_close_slice`, `proposals_compact_status` should report
one fewer open slice for that proposal and the proposal's `status` field
in `index.json` should read `done` once its last slice closes — if it does
not, run `state_health` (see `state-repair-playbook`) before retrying.
