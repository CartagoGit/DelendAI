# @cartago-git/mcp-git

Read-only **git orientation** plugin for
[`@cartago-git/mcp-core`](../../docs/README-MCP-CORE.md). Status, changed files, diff
stat and recent log as structured JSON, so agents cheaply see what changed —
agnostic of language or framework. It never modifies the repo.

## Enable

```jsonc
{
	"servers": {
		"mcp-core": {
			"command": "bunx",
			"args": ["@cartago-git/mcp-core", "--plugins=git"]
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
