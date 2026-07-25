# @mcp-vertex/logs

Persistent append-only event log plugin for `@mcp-vertex/core`.

Load it with:

```bash
mcp-vertex --plugins=logs
```

The plugin writes redacted JSONL records under two independently-retained
streams:

- `.cache/mcp-vertex/results/logs/` — every event (the full timeline).
- `.cache/mcp-vertex/results/logs-errors/` — only events whose outcome is
  not `ok`/`idle` (failed, timed-out, dead, cancelled, unknown), each with
  full context (args, error message + stack, `elapsedMs`). Start here when
  debugging or auditing — it points at exactly where execution didn't reach
  the state you expected, before you read a single source file.

Both streams are day-rotated JSONL, capturing tool start/completion/failure/
cancellation through the core instrumentation hooks, and are each retained
independently to the newest `retentionCount` files (default 10, oldest
dropped first — see `plugins.logs.options.retentionCount` in
`mcp-vertex.config.json`), so history from earlier sessions survives as long
as it fits that window. The plugin exposes read-only tools for querying,
tailing (main and error-only), subscribing, correlating and auditing
redaction.
