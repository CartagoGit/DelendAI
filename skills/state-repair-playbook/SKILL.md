---
name: state-repair-playbook
description: How to diagnose and heal inconsistent swarm state (stale locks, queue backpressure, orphaned agent assignments) with state_health and state_repair. Use when a tool reports a state-inconsistency failure, or proactively after a crashed/killed agent session.
---

# state repair playbook

Swarm state (locks, the persistent task queue, agent assignments) can drift
when an agent's process dies mid-slice — a killed session, an OOM, a host
restart. `state_health` / `state_repair`
(`plugins/proposals/src/lib/tools/state-tools.tool.ts`) exist specifically
to detect and heal that drift without a human grepping JSON files.

## Decision tree

```
suspect drift (a tool returned ok:false with reason "state-inconsistency",
or you are resuming after a session that ended abnormally)
  → state_health
      → { healthy: true }  → nothing to do, proceed
      → { healthy: false } → read which of locks/queue/registry is unhealthy
  → state_repair { mode: 'dry-run' }   (the default — read-only)
      → inspect `wouldRepair` (staleLocks, dueQueueEntries, orphan
        assignments) before touching anything
  → state_repair { mode: 'execute' }
      → re-run state_health to confirm `healthy: true`
```

## What each mode actually does

- **`state_health`** is purely read-only: it reports active write lanes
  (locks), queue backpressure (`waiterOrphans` vs a threshold) and orphaned
  agent assignments, and a single `healthy: boolean`. It changes nothing —
  safe to call as often as needed (though prefer `compact_status` for
  routine orientation; reserve `state_health` for when you actually suspect
  drift).
- **`state_repair { mode: 'dry-run' }`** (the default if `mode` is omitted)
  computes the same diagnosis and additionally reports `wouldRepair`: what
  GC pass would remove if you ran `execute`. Still read-only.
- **`state_repair { mode: 'execute' }`** is the only effectful call
  (`effects: ['write']`): it GCs locks past their `staleMs` window, expires
  queue entries that are past due, and force-releases orphaned agent
  assignments. Every individual repair goes through the engine's own
  atomic-write/mutex path — `state_repair` does not bypass the locking
  discipline it is fixing.

## Why a stale lock is safe to reclaim

`withFileMutex` (`packages/core/src/lib/shared/with-file-mutex.ts`) writes
an ownership token (`pid\nts\nUUID`) into the lock's sidecar file and
refreshes its mtime on a heartbeat while the holder is alive. A lock is
only "stale" — and therefore reclaimable by `state_repair` — once its
mtime is older than `staleMs` (default 30s), which can only happen if the
holder process is dead (a live holder keeps heartbeating). This is why
`state_repair` does not need a human to confirm "yes, that agent really is
gone" — the heartbeat already proved it.

## Never do

- Never delete a `.mutex` sidecar file by hand from the shell. It removes
  the ownership token check's safety net; `state_repair` does the same
  removal but only after confirming staleness via the heartbeat-derived
  mtime.
- Never run `mode: 'execute'` without first reading the `dry-run` output —
  on a healthy swarm it should report empty `wouldRepair` arrays; if it
  doesn't, understand why before forcing the repair.

## Smoke

`state_health` immediately after a clean `proposals_close_slice` call
should report `healthy: true` — if you ever see `healthy: false` right
after a normal close, that is itself a signal worth investigating (not
expected behaviour, not "just run repair and move on").
