# @mcp-vertex/completion

**Task-completion notifier** for [`@mcp-vertex/core`](../../packages/core).
An agent declares its **original** task done and thoroughly reviewed, the
declaration is recorded durably and pushed as an MCP notification, so the
operator knows the agent is now idle and will continue **only** when
explicitly told.

```bash
mcp-vertex --plugins=completion
```

## Why

`status-marker`'s `HECHO` is text the model writes at the end of a response;
`notification` only watches lock release and liveness heartbeats. Neither
tells the human "this agent finished its task and is idle". This plugin
turns that into a durable, machine-readable record plus a push.

## What it does

- `<prefix>_report_complete` — the agent declares its original task done +
  reviewed. Requires `reviewEvidence` (tests run, diff inspected, peer
  review) so "done" is a claim with proof, not a bare flag. The summary and
  evidence are redacted, stored (one file per `taskId`) and pushed:

  ```json
  { "event": "agent-complete", "taskId": "f00100-s1", "agent": "falcon", "summary": "…", "reviewEvidence": "…", "ts": "…" }
  ```

  via `notifications/message` (logger `<prefix>_completion`).

- `<prefix>_status` — lists every durable completion record (optionally
  filtered by `taskId` / `agent`), newest first.

- `<prefix>_clear` — the operator acknowledges a completion and removes
  the record from the idle list.

## Options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `recordsDir` | `string` | `<cacheDir>/completion/records` | Workspace-relative dir for durable records. |

## Contract

- One JSON record per `taskId` under the records dir; an upsert
  overwrites the previous declaration.
- Durable writes go through `withFileMutex` + `writeFileAtomic`; user
  text through `redactSecrets`. Corrupt / partially-written files are
  skipped by `status`, never fatal.
- The push is emitted directly in the reporting handler (the declaring
  agent and the notified human share one MCP server), so no cross-process
  file watch is needed — unlike the lock-release notifier.

## Enable

```jsonc
{
	"servers": {
		"mcp-vertex": {
			"command": "bunx",
			"args": ["@mcp-vertex/core", "--plugins=completion"]
		}
	}
}
```
