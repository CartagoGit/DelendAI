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

When the host boots, it picks a `surfaceMode` (how many tools the
first `tools/list` should expose):

| `surfaceMode` | First `tools/list` | When the client re-fetches after `listChanged`? |
| --- | --- | --- |
| `adaptive` (default) | 6 core tools (`overview`, `tool_search`, `plugin_activate`, `plugin_deactivate`, `status`, `vertex`) | Required to see the rest |
| `native` | Every tool of every loaded plugin (≈ 159 with the `swarm` preset + a couple of standalone plugins) | Not required |
| `compact` | A small curated subset | Required to see the rest |

The MCP spec lets the server **notify** the client of new tools via
`notifications/tools/list_changed`. In practice, VS Code's MCP
client does **not** re-fetch on that notification when the client
never declared the capability (and the spec doesn't make clients
do it by default). The result: with `adaptive`, the operator sees
"Discovered 6 tools" and never sees the rest, even though the server
has more.

**Two ways to fix it** (pick one, do not do both):

### Option A — pin `surfaceMode: "native"` in your project config

```jsonc
// ${workspaceFolder}/mcp-vertex.config.json
{
  "$schema": "https://unpkg.com/@mcp-vertex/core/schema/mcp-vertex.config.schema.json",
  "surfaceMode": "native",
  "plugins": { /* ... your plugin selection ... */ }
}
```

### Option B — pass `--surface=native` on the host args

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
        "--surface=native"
      ]
    }
  }
}
```

Either option yields the same result: every loaded tool is
enumerated on the first `tools/list` (≈ 159 with the `swarm`
preset). The host's stderr is also clean — the `[surface]` log line
only fires for capability-driven decisions and real surface
transitions, not for the explicit-override case.

## 3. The warning you may still see

If you keep the default `adaptive` and the warning is genuinely
useful (it tells you which surface the host chose and why), the
line looks like:

```
[surface] Client "Visual Studio Code" v1.134.0: client did not declare tools list-changed support; using adaptive surface (default since r00026 / TOK-004) — native remains available as an explicit override (changed=0)
```

This is **informational**, not an error. The `changed=0` suffix
means the surface the host picked was already the one in effect,
no tools were hidden or shown as a result. To silence it, use
Option A or B above.

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
