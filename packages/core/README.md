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

Full guide: **README-MCP-CORE.md** · Plugins: **PLUGINS-MCP-CORE.md** (docs folder).

BSD-3-Clause © Cartago
