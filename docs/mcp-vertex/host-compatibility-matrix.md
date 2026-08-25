# Host Compatibility Matrix — MCP surface & capabilities

> Canonical reference for which `surfaceMode` each known MCP host
> receives from `mcp-vertex`, what private capabilities it declares,
> and how to opt it into `native`.
>
> See ADR-0016 for the policy rationale; this file is the *applied*
> version of that policy.

## How to read this table

| Column                         | Meaning |
|--------------------------------|---------|
| **Host**                       | Name of the MCP client integration. |
| **`mcp-vertex/surface` declared** | Whether the host sets the private capability. |
| **Default surface received**   | What `decideSurfaceModeFromCapabilities` returns with no explicit override. |
| **Override to `native`**       | How to force `native` if needed. |

The bootstrap set (always present regardless of surface) is
`mcp-vertex_overview`, `mcp-vertex_tool_search`,
`mcp-vertex_tool_activate`, `mcp-vertex_tool_deactivate`,
`mcp-vertex_vertex`, `mcp-vertex_status`.

## Matrix

| Host                | `mcp-vertex/surface` declared | Default surface | Override to `native` |
|---------------------|--------------------------------|-----------------|----------------------|
| Claude Code         | No                             | `adaptive`      | Private capability OR `--surface=native` |
| Cursor              | No                             | `adaptive`      | `--surface=native` (config setting) |
| VS Code Copilot Chat| No                             | `adaptive`      | `mcp-vertex.config.json#surfaceMode=native` |
| Aider               | No                             | `adaptive`      | `--surface=native` |
| Codex               | No                             | `adaptive`      | `--surface=native` |
| MCP Inspector       | No                             | `adaptive`      | `--surface=native` |
| Plain MCP client (any spec-compliant host without the Vertex capability) | No | `adaptive` | `--surface=native` or config |
| Vertex-aware client (declares `mcp-vertex/surface: 'adaptive'`) | Yes — `adaptive` | `adaptive` | override to native via `--surface=native` |
| Vertex-aware client needing full bootstrap (declares `mcp-vertex/surface: 'native'`) | Yes — `native` | `native` | already native |
| `mcp-vertex_vertex` itself (when acting as client to another instance) | Yes — depends on use | mirrors declared value | `--surface=native` |

## How to verify

For any host above, run:

```bash
bun tools/scripts/test/run-actual-preset-budget.script.ts --dynamic-client --preset=swarm
# default → measures adaptive surface cost for an ordinary client

bun tools/scripts/test/run-actual-preset-budget.script.ts --static-client --preset=swarm --surface=native
# → measures native surface cost (the historical baseline)
```

The two outputs should differ by roughly the bootstrap-vs-full
ratio: `adaptive` ~6 tools, `native` ~all registered tools for that
preset.

## Edge case: never-refreshing clients

A client that receives `tools/list_changed` but never calls
`tools/list` again is **not stranded** on `adaptive`. The bootstrap
set includes `mcp-vertex_vertex`, which routes any (domain, action)
pair to the right activated tool. The e2e test
*"a client that never refreshes tools/list can still reach an
activated tool via the vertex router"* (in
`packages/core/tests/src/lib/e2e/tool-surface.e2e.spec.ts`) proves this.

## References

- ADR-0016 — `surface-policy-adaptive-default`
- `r00019` (q00004) — initial surface policy
- `r00026` (commit `58ef6288`) — flip default
- `c00018` — `develop nunca rojo` integration design
