# Example: multi-agent swarm

Coordinate several agents over one repo with the `swarm` preset — it adds the
`proposals` engine (locks, a persistent task queue, round-context, slice
disjointness), `notification` (push on lock-release, so agents don't poll),
`status-marker` (mandatory coloured close marker for every agent response) and
`test-convention` (canonical test rules + `suggest_spec_path` / `scan_drift`
tools so every agent writes and audits specs the same way) on top of
`standard`.

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

### Drop a plugin from the preset

Use `--exclude-plugins=` (or the camelCase alias `--excludePlugins=`) to
subtract one or more plugins from the resolved set:

```jsonc
{
  "servers": {
    "mcp-vertex": {
      "command": "bunx",
      "args": [
        "@mcp-vertex/core",
        "--preset=swarm",
        "--exclude-plugins=notification,quality"
      ]
    }
  }
}
```

This is useful when a preset ships with something you don't need (for example,
the `notification` plugin is moot for a single-agent session) or when you want
to test against a reduced surface. The exclusion is applied AFTER the preset
and any explicit `--plugins=` are merged, so the order of flags is irrelevant.

## What the swarm preset includes

| Plugin            | Why                                                                  |
|-------------------|----------------------------------------------------------------------|
| `standard` base   | `git`, `search`, `memory`, `docs`, `rules`, `quality`, `deps`        |
| `proposals`       | Multi-agent coordination: locks, task queue, round-context, slices.  |
| `notification`    | Push on lock-release so waiting agents stop polling.                 |
| `status-marker`   | Forces the canonical close marker on every response (8 states).      |
| `test-convention` | Publishes the canonical test rules and exposes `suggest_spec_path` + `scan_drift` so every agent writes specs the same way and the orchestrator can gate slice closes. |

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

1. `mcp-vertex_overview` → see the server + `recommendedNextAction`.
2. `proposals_auto_work` → one call returns the next proposal + a compact ordered
   plan (claim → slice → validate → sync → release). When nothing is actionable it
   returns `state: "idle"` and, after repeated idles, a hard `stop`.
3. Claim files with `proposals_agent_lock`; on `lock-conflict`, **do not retry** —
   wait for the `lock-released` notification, then retry once.
4. `proposals_sync_proposals` / `proposals_compact_status` to keep state coherent.
5. Every response ends with a `<status-marker>_close { state, reason? }` line
   (`🟩 [HECHO]`, `🟨 [CAP] — <reason>`, `🟥 [BLOQUEADO] — <reason>`, …).
6. Before writing a new spec, call
   `<test-convention>_suggest_spec_path { sourcePath: "src/lib/foo.ts" }` to
   get the right path + starter skeleton. Before closing a slice, call
   `<test-convention>_scan_drift { scope: "all" }` and refuse to close with
   `ok: false` — `counts.error` must be `0`.

> This repo dogfoods exactly this setup — see [`.mcp.json`](../../.mcp.json) and
> [`mcp-vertex.config.json`](../../mcp-vertex.config.json) at the root.
