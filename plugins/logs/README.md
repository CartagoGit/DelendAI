# @mcp-vertex/logs

Persistent append-only event log plugin for `@mcp-vertex/core`.

Load it with:

```bash
mcp-vertex --plugins=logs
```

The plugin writes redacted JSONL records under `.cache/mcp-vertex/logs/`,
captures tool start/completion/failure through the core instrumentation hooks,
and exposes read-only tools for querying, tailing, correlating and auditing
redaction.
