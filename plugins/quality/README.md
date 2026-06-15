# @cartago-git/mcp-quality

Quality-gate **runner** plugin for
[`@cartago-git/mcp-core`](../../docs/README-MCP-CORE.md). Executes the project's
validation commands (lint/test/build/typecheck) per scope and returns a
structured pass/fail report.

## Enable

```jsonc
{
	"servers": {
		"mcp-core": {
			"command": "bunx",
			"args": ["@cartago-git/mcp-core", "--plugins=quality"]
		}
	}
}
```

## Tools

| Tool | Purpose |
|---|---|
| `get_quality_scopes` | List the scopes and their commands (read-only). |
| `run_quality` | Run a scope and return per-command `{ ok, code, tail }`. Executes commands. |

## Where the commands come from (precedence)

1. plugin `options.scopes` (`{ "feature": ["bun run lint", "bun run test"] }`)
2. `mcp-core.config.json` → `validationMatrix.scopes`
3. detected `package.json` scripts (as one `all` scope)

MIT © Cartago
