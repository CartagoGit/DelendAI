# @cartago-git/mcp-search

Textual workspace **search** plugin for
[`@cartago-git/mcp-core`](../../packages/core). A grep-like `search` tool that
returns low-token `{file, line, text}` hits over allow-listed text files, so an
agent can locate code, proposals or notes without reading whole files.

## Load it

```bash
mcp-core --plugins=search
```

This registers one tool, `<prefix>_search`.

## Tool: `<prefix>_search`

| Input | Type | Default |
| --- | --- | --- |
| `query` | string | — (required) |
| `roots` | string[] | configured / `['.']` |
| `maxResults` | number | 50 (clamped 1..500) |
| `caseSensitive` | boolean | false |

Returns `{ query, count, truncated, scanned, hits: [{ file, line, text }] }`.
`file` is relative to the workspace root; `text` is the matching line, capped
to 240 chars. Result count is capped at `maxResults` (`truncated: true` when
hit).

## Configuration (`mcp-core.config.json`)

mcp-core is agnostic — the host owns what gets searched:

```json
{
  "plugins": {
    "search": {
      "options": {
        "roots": ["src", "docs"],
        "extensions": ["ts", "md"],
        "ignoreDirs": ["node_modules", ".git", "dist"],
        "maxResults": 100
      }
    }
  }
}
```

Binary/large files (> 1 MiB) and dependency/build directories
(`node_modules`, `.git`, `dist`, `build`, `coverage`, `.cache`, …) are skipped
by default. The search is live (no persisted index): always fresh, cheap for
the small/medium trees an MCP host serves.
