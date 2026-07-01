# @mcp-vertex/git

Read-only **git orientation** plugin for
[`@mcp-vertex/core`](../../docs/mcp-vertex/README-MCP-VERTEX.md). Status, changed files, diff
stat and recent log as structured JSON, so agents cheaply see what changed —
agnostic of language or framework. It never modifies the repo.

## Enable

```jsonc
{
	"servers": {
		"mcp-vertex": {
			"command": "bunx",
			"args": ["@mcp-vertex/core", "--plugins=git"]
		}
	}
}
```

## Tools

| Tool | Purpose |
|---|---|
| `git_status` | Branch + working-tree status (clean flag + entries). |
| `git_changed` | Just the changed file paths (cheapest orientation). |
| `git_diff` | `git diff --stat` (optionally staged or path-scoped). |
| `git_log` | Recent commits (hash + subject). |

All read-only — no add/commit/push.

BSD-3-Clause © Cartago
