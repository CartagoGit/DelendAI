# Example: a minimal server

The smallest useful mcp-vertex server — orientation plus a couple of read-only
plugins, loaded with the `minimal` preset (`git` + `search`).

## mcp.json

```jsonc
{
  "servers": {
    "mcp-vertex": {
      "command": "bunx",
      "args": ["@mcp-vertex/core", "--preset=minimal"]
    }
  }
}
```

That's it — point your MCP client at it and call `mcp-vertex_overview` to map the
server in one call. Add `--check` to self-diagnose without starting the server:

```bash
bunx @mcp-vertex/core --check --preset=minimal
```

## Presets (additive)

- `minimal` → `git`, `search`
- `standard` → `minimal` + `memory`, `docs`, `rules`, `quality`, `deps`
- `swarm` → `standard` + `proposals`, `notification` (see [`../swarm/`](../swarm/))

Pick plugins explicitly instead with `--plugins=git,memory,...`. Both can be
combined (the lists are merged + de-duped).
