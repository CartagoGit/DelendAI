# Example: multi-agent swarm

Coordinate several agents over one repo with the `swarm` preset — it adds the
`proposals` engine (locks, a persistent task queue, round-context, slice
disjointness) and `notification` (push on lock-release, so agents don't poll) on
top of `standard`.

## mcp.json

```jsonc
{
  "servers": {
    "mcp-vertex": {
      "command": "bunx",
      "args": ["@mcp-vertex/core", "--preset=swarm"]
    }
  }
}
```

Optional config (`mcp-vertex.config.json` at the workspace root):

```jsonc
{
  "$schema": "./node_modules/@mcp-vertex/core/schema/mcp-vertex.config.schema.json",
  "cacheDir": ".cache/mcp-vertex",
  "docsDir": "docs/mcp-vertex",
  "plugins": {
    "proposals": { "options": { "proposalFolders": ["paused/demos"] } }
  }
}
```

## The loop

1. `mcpcore_overview` → see the server + `recommendedNextAction`.
2. `proposals_auto_work` → one call returns the next proposal + a compact ordered
   plan (claim → slice → validate → sync → release). When nothing is actionable it
   returns `state: "idle"` and, after repeated idles, a hard `stop`.
3. Claim files with `proposals_agent_lock`; on `lock-conflict`, **do not retry** —
   wait for the `lock-released` notification, then retry once.
4. `proposals_sync_proposals` / `proposals_compact_status` to keep state coherent.

> This repo dogfoods exactly this setup — see [`.mcp.json`](../../.mcp.json) and
> [`mcp-vertex.config.json`](../../mcp-vertex.config.json) at the root.
