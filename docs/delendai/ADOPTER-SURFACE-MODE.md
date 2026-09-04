# Adopting `delendai` from another workspace

> Quick reference for someone wiring `delendai` into a project
> that is **not** the delendai monorepo itself. The
> [`AGENT-BOOTSTRAP.md`](AGENT-BOOTSTRAP.md) file is the universal
> contract; this page is a pragmatic checklist of the gotchas that
> trip up first-time integrators.

## 1. The host-server entrypoint

A VS Code / Cursor / generic MCP client config typically looks like:

```jsonc
{
  "servers": {
    "delendai": {
      "type": "stdio",
      "command": "bun",
      "args": [
        "<repo>/tools/scripts/host/host-server.script.ts",
        "--workspace=${workspaceFolder}",
        "--config=${workspaceFolder}/delendai.config.json"
      ]
    }
  }
}
```

`<repo>` is the absolute path to the delendai monorepo on your
machine. The host boots with `--preset=swarm` by default when no
preset/plugins are explicitly passed; it then **adds** the plugins
listed in `delendai.config.json` on top of the preset.

## 2. "I only see 8 tools" — the surface mode gotcha

**Since q00009 the silent default is `managed`** — the first
`tools/list` is a stable bootstrap surface and the remaining catalog
is reachable through the server-side router. It does not depend on
`notifications/tools/list_changed`, so clients that never refresh their
tool list remain functional.

When the host boots, it picks a `surfaceMode` (how many tools the
first `tools/list` should expose):

| `surfaceMode` | First `tools/list` | When to use it |
| --- | --- | --- |
| `native` | Every tool of every loaded plugin (≈ 159 with the `swarm` preset + a couple of standalone plugins) | Compatibility mode when the host needs the full first `tools/list` |
| `adaptive` | 6 core tools (`overview`, `tool_search`, `plugin_activate`, `plugin_deactivate`, `status`, `vertex`); the rest via `plugin_activate` + `tool_search` | Token-optimised, for clients that re-fetch on `list_changed` |
| `compact` | A small curated subset | Specialised, opt-in only |
| `managed` (default) | 6-tool bootstrap surface (`overview`, `tool_search`, `plugin_activate`, `plugin_deactivate`, `status`, `vertex`) — the rest of the catalog is reachable via the `vertex` router without being exposed in `tools/list` | Recommended default; no functional dependence on `tools/list_changed` |

The MCP spec lets the server **notify** the client of new tools
via `notifications/tools/list_changed`. In practice, a client may
not re-fetch on that notification, especially when it never declared
the capability. The managed default therefore keeps the router visible
so the operator can reach every tool even when no refresh happens.

**Opting into `adaptive` (rare)** — pick one, do not do both:

### Option A — pin `surfaceMode: "adaptive"` in your project config

```jsonc
// ${workspaceFolder}/delendai.config.json
{
  "$schema": "https://unpkg.com/@delendai/core/schema/delendai.config.schema.json",
  "surfaceMode": "adaptive",
  "plugins": { /* ... your plugin selection ... */ }
}
```

### Option B — pass `--surface=adaptive` on the host args

```jsonc
{
  "servers": {
    "delendai": {
      "type": "stdio",
      "command": "bun",
      "args": [
        "<repo>/tools/scripts/host/host-server.script.ts",
        "--workspace=${workspaceFolder}",
        "--config=${workspaceFolder}/delendai.config.json",
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
visible: `199 available · 6 exposed`.

The legacy alias `extended` maps to `adaptive` for backwards
compatibility with older configs — no operator action required.

The managed working set is bounded independently of `tools/list`. The
defaults are a 5-minute idle TTL and at most 8 warm plugins. They can be
changed (or disabled with `null`) without changing the exposed bootstrap:

```jsonc
{
  "surfaceMode": "managed",
  "managedSurface": {
    "idleTtlMs": 300000,
    "maxWarmPlugins": 8
  }
}
```

Plugin modules are loaded lazily by default for a managed surface. Set
`managedSurface.loading` to `eager` only for a compatibility host that needs
the historical assembly behavior. The startup report shows the effective
choice explicitly as `module loading lazy` or `eager`.

When lazy loading is active, the compact tool index is generated from the
plugin registrations and the first routed call imports only its owning
package. The real schema is then captured server-side and used to validate
the routed arguments before execution.

## 2.1 Runtime evidence and retention

Every core assembly creates the runtime-only directory
`.cache/delendai/evidence/`, with separate subdirectories for
`startup-report`, `surface`, `skills`, `verification` and `diagnostic`.
Startup reports are written there as JSON envelopes and are not part of the
repository's committed `docs/delendai/evidence/` acceptance fixtures.

Evidence is cleaned automatically on boot after 30 days by default. To tune
or disable that cleanup:

```jsonc
{
  "evidence": {
    "retentionDays": 14,
    "cleanup": "on-boot"
  }
}
```

Use `"dry-run"` to inspect candidates without deleting them, or `"off"` to
disable evidence cleanup. The cleanup is scoped to the evidence owner and
does not delete plugin cache data.

## 3. The warning you may still see

With the q00009 default of `managed`, stderr also contains the operator
startup report (configurable with `startupReport.level`). The `[surface]`
log only fires for a real surface transition; the stable default does not
emit a redundant capability-negotiation line on every boot. When a transition
does occur, it looks like:

```
[surface] Client "Visual Studio Code" v1.134.0: explicit surface override -> adaptive (changed=4)
```

That is **informational**, not an error. The explicit decision is honoured
and the rest of the host behaves accordingly.

## 4. Adding `agent-orchestrator` to your project

The `agent-orchestrator` plugin (q00007) is part of the
`@delendai/agent-orchestrator` package. It ships in the
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
the first `tools/list`. With the default `managed`, they remain
server-side and are reached through `vertex`; this does not require a
`list_changed` refresh. `adaptive` remains an explicit mode for hosts that
want its historical dynamic behaviour.

## 5. Sanity-check the wiring

After every config change, restart the MCP client and look for:

- The first `tools/list` count (the number after "Discovered").
- The `agent-orchestrator_*` tools in the list (`tool_search` if
  you can't see them, or `plugin_activate` with
  `{ "plugin": "agent-orchestrator" }`).
- The `delendai_overview` tool's response — `surfaceMode` is
  reflected in the `projectContext` field.

If the count does not match your expectations, run:

```bash
bun <repo>/tools/scripts/host/host-server.script.ts \
    --workspace=<your-project> \
    --config=<your-project>/delendai.config.json \
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
`startupReport.level` in `delendai.config.json` or pass
`--startup-report=<level>` on the host args.

The report distinguishes **`available`** (the full catalog MCP-Vertex
knows about) from **`exposed`** (the subset the LLM actually sees).
A `managed` host will read something like:

```
plugins        51 configured · 51 loaded · 0 warm · 0 failed
tools          199 available · 6 exposed to model
skills         37 available · 0 bodies preloaded
```

Even though the host says `Discovered 6 tools`, MCP-Vertex still
holds the full catalog server-side and reaches the other 195 via
the `vertex` router. **You do not need to depend on
`tools/list_changed` for this to work.**

Sample outputs for all five levels are in
[`evidence/q00009-startup-report-{off,compact,medium,high,full}.txt`](evidence/).
