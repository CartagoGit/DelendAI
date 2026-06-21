# @mcp-vertex/cli

Single human-facing CLI for `mcp-vertex`.

```bash
bun run cli -- --help
bun run cli -- overview --json
bun run cli -- search "assembleCliConfig" --max=5
```

The CLI is a thin wrapper over the public core/client surfaces. It starts the
same MCP server used by hosts and calls MCP tools over stdio instead of
importing plugin internals.
