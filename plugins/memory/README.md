# @mcp-vertex/memory

Persistent **project memory** plugin for
[`@mcp-vertex/core`](../../docs/mcp-vertex/README-MCP-VERTEX.md). Save/recall/list/forget
small notes stored in one JSON file under the cache dir, so any agent keeps
continuity across sessions with minimal tokens.

## Enable

```jsonc
{
	"servers": {
		"mcp-vertex": {
			"command": "bunx",
			"args": ["@mcp-vertex/core", "--plugins=memory"]
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
| `memory_export` / `memory_import` | Portable, redacted snapshots. |
| `memory_compact` | Distil and optionally persist a session digest. |
| `memory_compaction_check` | Decide whether context compaction is useful. |

Notes persist in `.cache/mcp-vertex/memory/notes.json`.
Writes redact secrets, use atomic replacement and enforce the configured note
quota inside the store mutex.

BSD-3-Clause © Cartago
