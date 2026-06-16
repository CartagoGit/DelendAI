# @cartago-git/mcp-memory

Persistent **project memory** plugin for
[`@cartago-git/mcp-core`](../../docs/README-MCP-CORE.md). Save/recall/list/forget
small notes stored in one JSON file under the cache dir, so any agent keeps
continuity across sessions with minimal tokens.

## Enable

```jsonc
{
	"servers": {
		"mcp-core": {
			"command": "bunx",
			"args": ["@cartago-git/mcp-core", "--plugins=memory"]
		}
	}
}
```

## Tools

| Tool | Purpose |
|---|---|
| `memory_save` | Save/update a titled note (+ tags). Upserts by title. |
| `memory_recall` | Recall notes by query and/or tags (newest first). |
| `memory_list` | List ids/titles/tags (cheap index). |
| `memory_forget` | Delete a note by id. |

Notes persist in `.cache/mcp-core/memory/notes.json`.

BSD-3-Clause © Cartago
