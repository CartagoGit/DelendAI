# @mcp-vertex/cli

Single human-facing CLI for `mcp-vertex`. It exposes the same MCP tool
surface used by IDE hosts, but from a terminal.

```bash
bun run cli -- --help
bun run cli -- overview --json
bun run cli -- search "assembleCliConfig" --max=5
```

The CLI is a thin wrapper over the public core/client surfaces. It starts the
same MCP server used by hosts and calls MCP tools over stdio instead of
importing plugin internals.

## Commands

| Command | Purpose |
|---|---|
| `status` | Runtime status collectors from the server. |
| `overview` | Compact server map: plugins, tools, knowledge and next action. |
| `plugin list` | Loaded plugin catalogue. |
| `plugin inspect <name>` | Tools exposed by one plugin. |
| `metrics` | Per-tool calls, errors, latency and response bytes. |
| `validate` | Run the root `bun run validate` gate. |
| `validate-matrix` | Show the configured validation matrix. |
| `config show|get|set|doctor|schema` | Inspect or safely update `mcp-vertex.config.json`. |
| `init` | Create a minimal `mcp-vertex.config.json`; refuses overwrite unless `--force`. |
| `search <query>` | Search text files through the `search` plugin. |
| `docs list|read` | Navigate markdown docs through the `docs` plugin. |
| `scaffold <kind> --name=<name>` | Generate core scaffolds; add `--out=<path>` to write. |

## Examples

```bash
bun run cli -- status --json
bun run cli -- plugin list --plugins=docs,search
bun run cli -- docs list --max=10 --json
bun run cli -- docs read docs/ARCHITECTURE.md
bun run cli -- config get plugins.docs.options.roots
```

Write-side commands use the public durable primitives from
`@mcp-vertex/core/public`: workspace containment, file mutexes, atomic writes
and secret redaction.

```bash
tmp="$(mktemp -d)"
bun run cli -- --workspace "$tmp" init
bun run cli -- --workspace "$tmp" config set plugins.docs.options.roots='["docs"]'
bun run cli -- --workspace "$tmp" scaffold tool --name=demo --out=demo.tool.ts
```

## Transport

Default mode starts a local MCP server for the selected workspace and calls it
over stdio. `--remote=stdio` keeps the same command parser and result shape,
while making the transport choice explicit. `tcp://host:port` is reserved for a
future transport and currently exits with code `6`.

```bash
bun run cli -- --remote=stdio overview --json
```
