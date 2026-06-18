# @mcp-vertex/notification

Lock-release **push** for [`@mcp-vertex/core`](../../packages/core). Instead of
every agent polling `agent_lock status` to learn when a file frees, each server
watches the shared lock file once and emits an MCP `notifications/message` the
moment a claim is released.

```bash
mcp-core --plugins=proposals,notification
```

## What it does

- Watches `<cacheDir>/agents.lock.json` (override with the `watchLockFile` option).
- On every release, pushes:
  ```json
  { "event": "lock-released", "taskId": "p81-s2", "agent": "falcon", "files": ["src/a.ts"] }
  ```
  via `notifications/message` (logger `<prefix>_notification`).
- Exposes `<prefix>_notify_status` → `{ watching, emitted, lastReleases }`.
- Exposes `<prefix>_await_lock { taskId, timeoutMs? }` → blocks until that task's
  lock is released (or the timeout elapses) and returns
  `{ taskId, released, timedOut, alreadyFree, waitedMs }`. This is the consumer
  side of the notifier: after `agent_lock` returns `lock-conflict`, call this once
  and retry the claim when it resolves — **do not poll `agent_lock status`**.

One local watch per server replaces N agents' polling round-trips — that is the
token saving in real swarms.

## Why a watch and not in-process events

Under stdio, each agent is its own `mcp-core` process. A release in process A
can't push to process B's client directly, so B's server watches the **shared
lock file** (the coordination substrate the swarm already uses) and notifies its
own client. Event-driven via `fs.watch` on the lock's directory (atomic writes
replace the file by rename), with a polling fallback for filesystems where
`fs.watch` is unreliable.

## Options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `watchLockFile` | `string` | `<cacheDir>/agents.lock.json` | Workspace-relative lock file to watch. |
| `intervalMs` | `number` | `2000` | Polling fallback interval. |
