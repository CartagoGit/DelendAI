---
name: concurrency-patterns
description: The repo's two concurrency primitives — withFileMutex (cross-process critical sections) and agent_lock/agent_worktree (multi-agent file-ownership coordination) — and when to use each. Use when several agents (or processes) might touch the same files at the same time.
---

# concurrency patterns

mcp-vertex has two distinct concurrency mechanisms that solve different
problems. Confusing them is the most common source of "it worked alone but
broke with two agents" bugs.

## `withFileMutex` — cross-process critical sections over ONE file

`packages/core/src/lib/shared/with-file-mutex.ts` wraps a read-modify-write
sequence over a single state file (lock registry, task queue, memory
store) so two processes never lose an update to a `rename()`-based atomic
write. Properties:

- **Ownership token**: the holder writes `pid\nts\nUUID` into a sidecar
  `<target>.mutex`; on release it deletes that sidecar *only if the token
  still matches*. This is what prevents a stale holder from deleting a
  stealer's brand-new lock.
- **Heartbeat**: the holder refreshes the sidecar's mtime every
  `heartbeatMs` while `fn()` runs, so a live-but-slow holder is never
  mistaken for a crashed one.
- **Staleness**: a waiter only steals a lock once its mtime is older than
  `staleMs` (default 30s) — i.e. the holder process actually died and
  stopped heartbeating.

Use `withFileMutex` when you are writing **engine code inside a plugin**
that mutates a shared JSON/markdown file on disk. You do not call this
from an agent session directly — it is an implementation detail of the
tools you call.

## `agent_lock` — multi-agent file-ownership coordination

`agent_lock` (proposals plugin) is a *different* layer: it is how multiple
**agents** (not processes) claim **non-overlapping sets of files** for a
proposal's slice, so two agents never edit the same file concurrently.
Where `withFileMutex` protects one state file for milliseconds during a
write, `agent_lock` protects a whole *file set* for the duration of an
entire slice (minutes to hours).

```
agent A: agent_lock { action: 'claim', files: ['plugins/x/src/a.ts'] }
agent B: agent_lock { action: 'claim', files: ['plugins/x/src/a.ts'] }
  → B gets a lock-conflict; B does NOT poll status in a loop
  → B waits for the lock-released notification, then retries once
```

## `agent_worktree` — branch isolation, used together with `agent_lock`

> **Host gate (f00052):** `agent_worktree` is a host-scoped *capability*,
> off by default. Read `mcp-vertex.config.json#agentWorktree` (or the
> `--agent-worktree` CLI flag). If `false`/unset — do not call
> `proposals_agent_worktree`; commit to the active branch instead. This
> section documents the *primitive*; the *when-to-use* decision lives in the
> proposal playbooks and respects this flag.

`agent_lock` stops two agents editing the *same file*; it does not stop a
push from one agent clobbering another's in-flight branch. `agent_worktree`
creates a disposable git worktree + branch per agent, so each agent's
`commit-and-push` (see `token-budget-playbook` / `proposal-swarm-runner`
for `auto_work`'s persist modes) lands on its own branch, not on a shared
checkout. Use them together: `agent_lock` for "who owns these files right
now", `agent_worktree` for "where does this agent's git history live until
it's ready to merge".

## Wait-for-notification, don't poll

Both `agent_lock` conflicts and queue backpressure resolve via a push
notification (`notification` plugin emits `lock-released`), not by an
agent re-calling a status tool in a loop. Polling burns tokens for no
benefit — the state cannot change faster than the holder's actual work
completes, and the notification fires the instant it does.

## Smoke

Two agents claiming disjoint file sets for the same proposal's different
slices should both succeed immediately (no conflict, because `agent_lock`
keys on the file set, not the proposal id) — if a claim is rejected despite
disjoint files, that's a bug in the file-set computation, not expected
contention.
