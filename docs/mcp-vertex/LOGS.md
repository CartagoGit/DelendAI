# MCP logs

The `@mcp-vertex/logs` plugin persists an append-only JSONL event log under
`.cache/mcp-vertex/logs/<YYYY-MM-DD>.jsonl`.

Each line is a redacted event:

```json
{
  "ts": "2026-06-20T19:00:00.000Z",
  "kind": "tool-completed",
  "agent": null,
  "taskId": "mcp-vertex_overview",
  "outcome": "ok",
  "files": [],
  "summary": "tool-completed: mcp-vertex_overview",
  "meta": {}
}
```

Events pass through the shared `redactSecrets` primitive before they are
written. Individual lines are capped at 8 KiB; over-sized records are replaced
with a compact event whose `meta.__truncated__` flag is `true`.

Retention defaults to 30 days. Garbage collection runs when the plugin loads and
deletes day files older than the retention window. Rotation is daily by event
timestamp.

The log covers server-side events: tool calls, failures and future notification
bus events. It cannot see editor-side chat cancellation unless the editor sends a
server-side cancellation signal. In that case the honest log result is usually:
the server tool started and completed, while the client stopped rendering.
