# Host Compatibility Matrix — MCP surface & capabilities

> Canonical reference for the stable `surfaceMode` policy. The default is
> `managed`; the full `native` surface is always an explicit opt-in.
>
> See ADR-0016 for the policy rationale; this file is the *applied*
> version of that policy.

## How to read this table

| Column                         | Meaning |
|--------------------------------|---------|
| **Host**                       | Name of the MCP client integration. |
| **`delendai/surface` declared** | Kept for compatibility; it no longer silently changes the mode. |
| **Default surface received**   | `managed` unless config or CLI selects another mode. |
| **Override to `native`**       | How to force `native` if needed. |

The bootstrap set (always present regardless of surface) is
`delendai_overview`, `delendai_tool_search`,
`delendai_tool_activate`, `delendai_tool_deactivate`,
`delendai_vertex`, `delendai_status`.

## Matrix

| Host                | `delendai/surface` declared | Default surface | Override to `native` |
|---------------------|--------------------------------|-----------------|----------------------|
| Claude Code         | No                             | `managed`      | `--surface=native` |
| Cursor              | No                             | `managed`      | `--surface=native` (config setting) |
| VS Code Copilot Chat| No                             | `managed`      | `delendai.config.json#surfaceMode=native` |
| Aider               | No                             | `managed`      | `--surface=native` |
| Codex               | No                             | `managed`      | `--surface=native` |
| MCP Inspector       | No                             | `managed`      | `--surface=native` |
| Plain MCP client (any spec-compliant host) | No | `managed` | `--surface=native` or config |
| Vertex-aware client | Optional | `managed` | explicit `--surface=...` or config |
| `delendai_vertex` itself (when acting as client to another instance) | Optional | `managed` | explicit `--surface=...` |

## How to verify

For any host above, run:

```bash
bun tools/scripts/test/run-actual-preset-budget.script.ts --preset=swarm
# default → measures the stable managed/bootstrap surface

bun tools/scripts/test/run-actual-preset-budget.script.ts --static-client --preset=swarm --surface=native
# → measures native surface cost (the historical baseline)
```

The two outputs should differ by roughly the bootstrap-vs-full ratio:
`managed`/`adaptive` expose the bootstrap surface, while `native` exposes
all registered tools for that preset.

## Edge case: never-refreshing clients

A client that receives `tools/list_changed` but never calls
`tools/list` again is **not stranded** on `adaptive`. The bootstrap
set includes `delendai_vertex`, which routes any (domain, action)
pair to the right activated tool. The e2e test
*"a client that never refreshes tools/list can still reach an
activated tool via the vertex router"* (in
`packages/core/tests/src/lib/e2e/tool-surface.e2e.spec.ts`) proves this.

## References

- ADR-0017 — `surface-policy-managed-default`
- `r00019` (q00004) — initial surface policy
- `r00026` (commit `58ef6288`) — flip default
- `c00018` — `develop nunca rojo` integration design
