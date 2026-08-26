# Adopting `mcp-vertex` from another workspace

> Quick reference for someone wiring `mcp-vertex` into a project
> that is **not** the mcp-vertex monorepo itself. The
> [`AGENT-BOOTSTRAP.md`](AGENT-BOOTSTRAP.md) file is the universal
> contract; this page is a pragmatic checklist of the gotchas that
> trip up first-time integrators.

## 1. The host-server entrypoint

A VS Code / Cursor / generic MCP client config typically looks like:

```jsonc
{
  "servers": {
    "mcp-vertex": {
      "type": "stdio",
      "command": "bun",
      "args": [
        "<repo>/tools/scripts/host/host-server.script.ts",
        "--workspace=${workspaceFolder}",
        "--config=${workspaceFolder}/mcp-vertex.config.json"
      ]
    }
  }
}
```

`<repo>` is the absolute path to the mcp-vertex monorepo on your
machine. The host boots with `--preset=swarm` by default when no
preset/plugins are explicitly passed; it then **adds** the plugins
listed in `mcp-vertex.config.json` on top of the preset.

## 2. "I only see 8 tools" — the surface mode gotcha

**Since r00027 the silent default is `native`** — every loaded
tool is enumerated on the first `tools/list` without depending
on `notifications/tools/list_changed` notification handling.
You should not have to configure anything for the common case.
If you ever want a smaller surface, opt in explicitly.

When the host boots, it picks a `surfaceMode` (how many tools the
first `tools/list` should expose):

| `surfaceMode` | First `tools/list` | When to use it |
| --- | --- | --- |
| `native` (default since r00027) | Every tool of every loaded plugin (≈ 159 with the `swarm` preset + a couple of standalone plugins) | The common case — operator sees every tool, no refresh dance needed |
| `adaptive` | 6 core tools (`overview`, `tool_search`, `plugin_activate`, `plugin_deactivate`, `status`, `vertex`); the rest via `plugin_activate` + `tool_search` | Token-optimised, for clients that re-fetch on `list_changed` |
| `compact` | A small curated subset | Specialised, opt-in only |
| `managed` (q00009) | Bootstrap surface (`overview`, `tool_search`, `vertex`, `status`) — the rest of the catalog is reachable via the `vertex` router without being exposed in `tools/list` | Recommended for token-sensitive hosts; no functional dependence on `tools/list_changed` |

The MCP spec lets the server **notify** the client of new tools
via `notifications/tools/list_changed`. In practice, VS Code's
MCP client does **not** re-fetch on that notification when the
client never declared the capability. That is why r00027 flipped
the default back to `native`: the operator sees every tool on
the first `tools/list`, regardless of the client's notification
handling.

**Opting into `adaptive` (rare)** — pick one, do not do both:

### Option A — pin `surfaceMode: "adaptive"` in your project config

```jsonc
// ${workspaceFolder}/mcp-vertex.config.json
{
  "$schema": "https://unpkg.com/@mcp-vertex/core/schema/mcp-vertex.config.schema.json",
  "surfaceMode": "adaptive",
  "plugins": { /* ... your plugin selection ... */ }
}
```

### Option B — pass `--surface=adaptive` on the host args

```jsonc
{
  "servers": {
    "mcp-vertex": {
      "type": "stdio",
      "command": "bun",
      "args": [
        "<repo>/tools/scripts/host/host-server.script.ts",
        "--workspace=${workspaceFolder}",
        "--config=${workspaceFolder}/mcp-vertex.config.json",
        "--surface=adaptive"
      ]
    }
  }
}
```

**Opting into `compact`**: same pattern, value `compact`.

**Opting into `managed`** (q00009 / f00254): same pattern, value
`managed`. In managed mode the catalog stays server-side; the host
sees only the bootstrap surface and uses the `vertex` router to
reach the rest. The startup report (see §5) makes the split
visible: `199 available · 4 exposed`.

The legacy alias `extended` maps to `adaptive` for backwards
compatibility with older configs — no operator action required.

## 3. The warning you may still see

With the r00027 default of `native`, the host's stderr is clean
for plain MCP clients. The `[surface]` log only fires for
capability-driven decisions (the client declared the private
`mcp-vertex/surface` extension) and for real surface transitions
(the runtime actually hid/showed tools). When you see one, it
looks like:

```
[surface] Client "Visual Studio Code" v1.134.0: client declared tools list-changed support; using adaptive surface
```

That is **informational**, not an error. The decision is honoured
(`adaptive` was requested) and the rest of the host behaves
accordingly.

## 4. Adding `agent-orchestrator` to your project

The `agent-orchestrator` plugin (q00007) is part of the
`@mcp-vertex/agent-orchestrator` package. It ships in the
`swarm`/`full`/`vertex` presets. To enable it standalone in a
project that doesn't pick a preset:

```jsonc
{
  "plugins": {
    "agent-orchestrator": {
      "options": {
        "policy": {
          "defaultMode": "auto",
          "defaults": {
            "budget": {
              "maxTokensOrchestrator": 200000,
              "maxTokensPerSubagent": 50000,
              "timeoutMs": 0
            },
            "rotation": {
              "maxIterationsPerSubagent": 3,
              "allow": [
                "token-budget-exhausted",
                "schema-violation",
                "repeated-output",
                "error-storm"
              ]
            }
          }
        }
      }
    }
  }
}
```

With `surfaceMode: "native"`, the four tools
`agent-orchestrator_{plan, dispatch, budget, plan_ref}` appear in
the first `tools/list`. With `adaptive`, they only appear once the
client re-fetches after a `list_changed` notification (rare in
practice).

## 5. Sanity-check the wiring

After every config change, restart the MCP client and look for:

- The first `tools/list` count (the number after "Discovered").
- The `agent-orchestrator_*` tools in the list (`tool_search` if
  you can't see them, or `plugin_activate` with
  `{ "plugin": "agent-orchestrator" }`).
- The `mcp-vertex_overview` tool's response — `surfaceMode` is
  reflected in the `projectContext` field.

If the count does not match your expectations, run:

```bash
bun <repo>/tools/scripts/host/host-server.script.ts \
    --workspace=<your-project> \
    --config=<your-project>/mcp-vertex.config.json \
    --surface=native
```

and fire a `tools/list` against stdin (the repo ships
`tools/scripts/host/host-server.script.ts` for exactly this kind of
debugging).

## 5. The Startup Report — `available` vs `exposed` (q00009)

When MCP-Vertex boots, it emits a Startup Report on **stderr** (or
the host Output Channel for VS Code). It is **never** written to
stdout of the MCP stdio transport. The report has five levels:

| Level | What you see |
| --- | --- |
| `off` | Nothing — only fatal diagnostics. |
| `compact` | Identity + catalog counts + per-request cost + managed runtime. |
| `medium` (default) | Everything in `compact` + the **per-plugin per-request cost table** with totals. |
| `high` | Everything in `medium` + plugin detail (no full schemas). |
| `full` | Everything in `high` + sanitised configuration snapshot. |

The default is `medium`. To change it, set
`startupReport.level` in `mcp-vertex.config.json` or pass
`--startup-report=<level>` on the host args.

The report distinguishes **`available`** (the full catalog MCP-Vertex
knows about) from **`exposed`** (the subset the LLM actually sees).
A `managed` host will read something like:

```
plugins        51 configured · 6 warm · 0 failed
tools          199 available · 4 exposed to model
skills         37 available · 0 bodies preloaded
```

Even though the host says `Discovered 4 tools`, MCP-Vertex still
holds the full catalog server-side and reaches the other 195 via
the `vertex` router. **You do not need to depend on
`tools/list_changed` for this to work.**

Sample outputs for all five levels are in
[`evidence/q00009-startup-report-{off,compact,medium,high,full}.txt`](evidence/).

