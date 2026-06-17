# Example: multi-agent swarm

Coordinate several agents over one repo with the `swarm` preset — it adds the
`proposals` engine (locks, a persistent task queue, round-context, slice
disjointness) and `notification` (push on lock-release, so agents don't poll) on
top of `standard`.

## mcp.json

```jsonc
{
  "servers": {
    "mcp-core": {
      "command": "bunx",
      "args": ["@cartago-git/mcp-core", "--preset=swarm"]
    }
  }
}
```

Optional config (`mcp-core.config.json` at the workspace root):

```jsonc
{
  "$schema": "./node_modules/@cartago-git/mcp-core/schema/mcp-core.config.schema.json",
  "cacheDir": ".cache/mcp-core",
  "docsDir": "docs/mcp-core",
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
> [`mcp-core.config.json`](../../mcp-core.config.json) at the root.
