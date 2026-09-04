# @delendai/context-for-change

Compact **change context** plugin for
[`@delendai/core`](../../packages/core). It exposes one bounded
`context_for_change` tool that combines the minimum useful context for a task:
diff, symbols, references, related tests, docs, conventions and test policy.

## Load it

```bash
mcp-vertex --plugins=context-for-change
```

This registers one tool, `<prefix>_context_for_change`.

## Tool: `<prefix>_context_for_change`

| Input | Type | Default |
| --- | --- | --- |
| `files` | string[] | — |
| `gitDiff` | string | — |
| `symbol` | string | — |
| `task` | string | — |

Returns a compact object with `sections`, `files`, `dependsOn`, `bytes` and a
`truncated` marker when the payload had to be reduced to stay within budget.

## Configuration (`mcp-vertex.config.json`)

```json
{
  "plugins": {
    "context-for-change": {
      "options": {
        "maxBytes": 3000,
        "docsRoots": ["docs", "README.md"],
        "memoryStorePath": ".cache/mcp-vertex/memory/notes.json"
      }
    }
  }
}
```

`memoryStorePath` is optional. When it is absent, the tool degrades gracefully
and reports memory recall as unavailable instead of guessing a host-specific
store path.