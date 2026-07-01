# @mcp-vertex/core

Project-agnostic core for building MCP servers + a CLI plugin loader. Drop it
into any project to analyze the repo and scaffold an optimal MCP server, and
turn on capability with plugins (`mcp-vertex --plugins=...`).

```jsonc
// .vscode/mcp.json
{
	"servers": {
		"mcp-vertex": {
			"command": "bunx",
			"args": ["@mcp-vertex/core", "--plugins=proposals"]
		}
	}
}
```

- Built-in tools: `analyze_project`, `create_server` (hybrid bootstrap) and
  `scaffold` (tools/prompts/skills/agents/plugins).
- Plugins implement `IMcpPlugin`; load them by name via `--plugins`.
- Usable as a plain library too (import from `@mcp-vertex/core/public`).

## Scaffold + migrations

`mcp-vertex.config.json` accepts `keepLegacy` (default `false`). With the
default, scaffold writes skip existing files. When `keepLegacy: true` is set
globally, or passed to one `<prefix>_scaffold` call, an existing target is moved
to `legacy/<basename>-<timestamp>.<ext>` before the fresh template is written.
This is for migration/refactor work where old host files need to stay available
for comparison or rollback; clean up snapshots after review, for example with
`git clean -fd legacy/` in a disposable working tree.

Versioned JSON migrations expose the same preservation idea as a per-call
escape hatch: `migrateJsonFile(..., { forceBackup: true })` writes a `.bak-*`
snapshot even when no migrator runs.

Full guide: **README-MCP-VERTEX.md** · Plugins: **PLUGINS-MCP-VERTEX.md** (docs folder).

BSD-3-Clause © Cartago
