---
name: mcp-vertex-multi-agent-coordination
appliesTo: ['@mcp-vertex/proposals', '@mcp-vertex/notification']
description: How to coordinate several agents safely in this repo: when to use agent_lock vs agent_worktree, how to wait on lock-released instead of polling, and how to keep repeated MCP reads under control with round_context digests.
---

# mcp-vertex multi-agent coordination

Use this when more than one agent is active in the repo, or when a slice
may overlap another agent's file set.

## `agent_lock` vs `agent_worktree` vs `branch_status` vs `branch_gc`

These four tools solve different problems and are usually used together,
not interchangeably.

### `agent_lock`

`proposals_agent_lock` is **write ownership over files**. Claim it before
editing a slice's files; release it after the slice closes.

Use `agent_lock` when:
- two agents might edit the same file set
- the proposal slice is document-defined and file-scoped
- you need conflict detection before editing

Do not use `agent_lock` for:
- choosing the next task
- branch isolation
- polling whether work is "probably" done

### `agent_worktree`

Read `mcp-vertex.config.json#agentWorktree` (or the `--agent-worktree` CLI
flag) first. If `false`/unset — do not call `proposals_agent_worktree`;
commit to the active branch instead. The tool stays registered but, when the
host has not enabled the capability, returns a structured `ok: false` error
telling you how to enable it. Everything below applies only when the host has
turned the gate on.

`proposals_agent_worktree` is **git isolation**. It gives an agent its own
branch/worktree so commits and pushes do not trample another agent's
checkout.

Use `agent_worktree` (with the host gate enabled) when:
- the slice will create commits or push
- several agents are landing changes in parallel
- `auto_work` persist mode is `commit-and-push`

Use both together when:
- an agent owns files for a slice **and** needs isolated git history

Use only `agent_lock` when:
- the work stays in the shared checkout and no push is involved

Use only `agent_worktree` rarely:
- mainly for read-mostly investigation or pre-isolated work where the
  file set is already guaranteed disjoint by another mechanism

### `branch_status` — visibility (f00073)

`<prefix>_branch_status` is **read-only**. It answers "what is every other
agent doing right now?" without grep, by inspecting every `agent/*` local
branch and every `git worktree` in the workspace. Reports ahead/behind
counts vs `develop`, last-commit age, merged flag, and per-worktree
dirty + untracked file counts. Worktrees whose path lives outside
`<cacheDir>/mcp-vertex/.worktrees` are flagged `outOfCache: true` (AGENTS.md
invariant violation).

The orchestrator's `auto_work` plan already carries a `branchStatusWarnings`
field populated from this snapshot — worktrees with dirty/untracked files,
branches ahead-of-base that are unmerged, and branches that fell behind
`develop` while another agent was working.

Use it when:
- you are about to merge or rebase and want to know what is in flight
- a slice reports `branchStatusWarnings` and you need the raw numbers
- you are debugging "where did that worktree come from?" / "is this
  branch still alive?"

### `branch_gc` — cleanup (f00073)

`<prefix>_branch_gc` is **read-write** and idempotent. Removes worktrees
that have decayed into orphan state: branch merged into base, clean
working tree, idle longer than `staleMinutes` (default 60). Defaults to
`dryRun: true` so the orchestrator always sees the plan first.

Use it when:
- `branch_status` reports worktrees with `dirty == 0` and
  `mergedIntoBase: true` older than `staleMinutes`
- a `git worktree list` shows ghost worktrees pointing at merged
  branches you do not want to clean up by hand

Two safety nets:
- **Unmerged branches are sacred.** `branch_gc` never removes a worktree
  whose branch is ahead of base, even with `force: true`. Pass a real
  `git push origin agent/<name> --force-with-lease` if you want to
  rebase and lose history; `branch_gc` will not do it for you.
- **Dirty worktrees are warned.** Without `force: true`, a worktree with
  modified or untracked files is reported as `skipped: dirty` (or
  `untracked`) and never removed.

## Wait-for-notification, don't poll

On lock contention, the canonical path is:

```text
proposals_agent_lock { action: "claim", ... }
  -> if conflict: notification_await_lock once
  -> or wait for the lock-released notification
  -> retry the same claim scope once
```

Do not spin on `proposals_agent_lock { action: "status" }`.
That burns tokens and adds no new information faster than the holder can
finish work.

## When you see unexpected changes (c00012)

In a shared repo with several agents, **expect** the working tree, the
index, and the active branch to change under you between writes. That is
the normal state, not a failure.

The full five-point rule lives in
[`docs/mcp-vertex/AGENT-BOOTSTRAP.md` § 4.b "Coexistence with parallel
work"](../../../docs/mcp-vertex/AGENT-BOOTSTRAP.md) — that is the
single source of truth, always loaded by every host. This skill restates
the swarm-specific micro-pattern:

```text
git log -1 -- <path>          # what changed?
git diff HEAD~1 -- <path>     # full diff if needed
# accept and proceed, OR surgical follow-up. NEVER re-plan.
```

Applies symmetrically to peer agents, CI, humans, the catalog
regenerator, the worktree's own pre-commit hooks, and stale worktrees
sharing `.git`. Same answer in every case: keep working.

## `round_context` is a digest cache, not a reason to re-read everything

`proposals_round_context` is for cheap orientation:
- read digests, active task ids, and coarse state
- decide whether something changed enough to justify a fresh read

Do not re-read unchanged docs just because the tool exists.
If the digest is unchanged, keep moving on the current slice.
If the digest says `stale: true`, trust the source file or lock file over
the cached summary.

## Practical patterns

### Pattern 1 — Shared checkout, no push

```text
auto_work
-> continue_proposal mode:"plan"
-> agent_lock claim files:[...]
-> edit only claimed files
-> validate slice gate
-> close_slice
```

This is the cheapest path for one small slice in one shared tree.

### Pattern 2 — Parallel implementation with isolated git history

```text
auto_work
-> continue_proposal mode:"plan"
-> proposals_delegate { taskId, slot, files }
   (assigns the agent name, claims the files, and — when the host
    gate `agentWorktree: true` is on — creates the per-agent worktree
    + branch `agent/<assigned-name>` atomically; x00051)
-> implement in the worktree path
-> validate
-> close_slice
-> maybePersistAfterSlice { mode: "commit-and-push", pushTarget: "origin agent/<branch>" }
```

This is the safe path when more than one agent may commit concurrently.
The orchestrator no longer has to remember the `agent_worktree create`
step — `delegate` does it. Manual `agent_worktree` is still the right tool
for sidecar worktrees that do not need a delegated agent.

### Pattern 3 — Claimed file conflict

```text
agent_lock claim files:[plugins/x/src/a.ts]
-> conflict
-> await_lock once
-> retry same files once after lock-released
```

Do not widen the claim to unrelated files just to "make progress".
Either wait, or take a different truly disjoint slice.

## Three condensed session examples

### Example A — Two doc slices, disjoint files

- Agent A claims `packages/core/skills/manifest.json` + one new `SKILL.md`
- Agent B claims one unrelated proposal doc under `docs/mcp-vertex/proposals/`
- Both succeed immediately because the file sets are disjoint
- No polling is needed; both validate and close independently

### Example B — Same plugin, overlapping file

- Agent A claims `plugins/git/src/public/index.ts`
- Agent B tries to claim the same file for another slice
- Agent B gets contention and waits for `lock-released`
- Agent B retries once after the notification instead of status-looping

### Example C — Push-capable parallel work

- Agent A and Agent B both need commits
- Each gets an `agent_worktree`
- Each still claims its file set with `agent_lock`
- Commits land on separate branches; no shared-checkout push races

## Never do this

1. Do not poll `agent_lock status` in a loop.
2. Do not treat `agent_worktree` as a replacement for file ownership.
3. Do not re-read docs whose `round_context` digest has not changed.
4. Do not push from a shared checkout when a disposable worktree is the
   intended safety boundary.

## Smoke

A minimal healthy multi-agent flow looks like this:

```text
mcp-vertex_overview { compact: true }
-> proposals_auto_work {}
-> proposals_continue_proposal { id, mode: "plan" }
-> proposals_agent_lock { action: "claim", agent, task_id, files }
```

If claim succeeds on disjoint files and a conflicting claim produces a
single wait path (`await_lock` / `lock-released`) instead of repeated
status checks, the coordination surface is behaving correctly.
