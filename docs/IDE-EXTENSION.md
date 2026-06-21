# IDE Extension

The `@mcp-vertex` IDE extension ships as a VS Code extension today and
is designed to be **portable** to JetBrains, Zed, Cursor and
Antigravity through the `IHostAdapter` seam. See
[`CROSS-IDE.md`](CROSS-IDE.md) for the cross-IDE guide.

## What you get

The extension is a **branded observability cockpit** for any running
`mcp-vertex` MCP server. It connects over stdio via
[`@mcp-vertex/client`](../packages/client/) and surfaces:

- **Tool tree** — server → plugins → tools, with hover descriptions
  from `knowledge`.
- **Proposal board tree** — every proposal grouped by status.
- **9-panel dashboard webview** (f125 + f126):
  1. **Overview** — server identity, plugins, tools, recommended
     next action.
  2. **Metrics** — per-tool calls/errors/latency with sparklines.
  3. **Tokens** — tokens used, tokens saved (vs compact), savings %.
  4. **Tools** — sortable table of every tool with its metric row.
  5. **Plugins** — per-plugin rollup + token share bar chart.
  6. **Sessions** — active proposals, grouped by status.
  7. **Times** — total wall, p50/p95, slowest tool, histogram.
  8. **Agents** — active agents (from `proposals_agent_names`).
  9. **Health** (f126) — `proposals_state_health` + stale agents +
     queue + active agents aggregated into one panel.
- **Knowledge navigator** (f126) — `mcp-vertex.openKnowledge`
  opens a category-grouped navigator webview with in-place search
  and a Markdown body preview.
- **Tool search** (f126) — `mcp-vertex.toolSearch` opens a
  QuickPick over the live tool registry + knowledge entries.
- **Web-embed docs** — the dashboard's Docs tab loads the configured
  docs URL (defaults to `https://mcp-vertex.dev`).
- **Connection-health status bar** (f126) — the status bar shows
  `$(circle-green)` / `$(circle-red)` based on the live ping of
  `status-marker_ping`. Click → open the dashboard. `Restart MCP
  Server` re-spawns the server.
- **Logs in real time** (f126) — `LogsService.subscribe` polls
  `logs_subscribe` and dedupes; the `NotificationLogsBridge`
  correlates each event with the tool calls that fired within ±5s.
- **i18n** — 12 languages parity-checked by
  `bun run check:i18n:ide`.

## Data flow

```
                ┌────────────────────────┐
                │ @mcp-vertex/core       │
                │ (MCP server, stdio)    │
                └──────────┬─────────────┘
                           │ JSON-RPC over stdio
                           ▼
                ┌────────────────────────┐
                │ @mcp-vertex/client     │
                │ - McpStdioClient       │
                │ - DashboardService     │
                │ - LogsService          │
                │ - SearchService        │
                │ - KnowledgeService     │
                │ - HealthService        │
                │ - ConnectionHealthSvc  │
                │ - EmbedService         │
                └──────────┬─────────────┘
                           │ typed JS objects
                           ▼
                ┌────────────────────────┐
                │ @mcp-vertex/ui-extension│
                │ - renderDashboard      │
                │ - 8 panel renderers    │
                │ - sparkline, barChart  │
                │ - renderKnowledgeNav   │
                └──────────┬─────────────┘
                           │ HTML strings
                           ▼
                ┌────────────────────────┐
                │ extensions/vscode      │
                │ - VscodeHostAdapter    │
                │ - Dashboard command    │
                │ - Knowledge command    │
                │ - Search command       │
                │ - Restart command      │
                │ - Status bar           │
                │ - Tree views           │
                └────────────────────────┘
```

## Brand assets

The extension uses the same logo as the docs site:
[`apps/web/public/logo.svg`](../apps/web/public/logo.svg). The asset
is **copied byte-identically** to
[`extensions/vscode/media/logo.svg`](../extensions/vscode/media/logo.svg) and
verified by `bun run lint:brand`.

A monochrome variant
([`extensions/vscode/media/logo-mono.svg`](../extensions/vscode/media/logo-mono.svg))
is shipped for low-contrast themes. The palette is defined as CSS
custom properties in
[`extensions/vscode/media/dashboard.css`](../extensions/vscode/media/dashboard.css)
and falls back to VS Code theme variables when running inside the
editor.

## Commands

| Command id | Title | Purpose |
|---|---|---|
| `mcp-vertex.openDashboard` | `mcp-vertex: Open Dashboard` | Open the branded 9-panel webview. |
| `mcp-vertex.openDocs` | `mcp-vertex: Open Documentation` | Open the configured docs URL in an iframe. |
| `mcp-vertex.openKnowledge` | `mcp-vertex: Open Knowledge Navigator` | Browse + preview the server's knowledge entries. |
| `mcp-vertex.toolSearch` | `mcp-vertex: Search Tools` | Fuzzy-substring match over the tool registry. |
| `mcp-vertex.refresh` | `mcp-vertex: Refresh` | Re-fetch the registry + metrics + proposals. |
| `mcp-vertex.runValidation` | `mcp-vertex: Run Validation` | Run `mcp-vertex_get_validation_matrix` + `quality_run_quality` (dry). |
| `mcp-vertex.openProposal` | `mcp-vertex: Open Proposal Board` | Show `proposals_proposal_board`. |
| `mcp-vertex.restartServer` | `mcp-vertex: Restart MCP Server` | Re-spawn the stdio process. |
| `mcp-vertex.showOverview` | `mcp-vertex: Show Overview` | **Compat** — opens the dashboard's Overview tab. |
| `mcp-vertex.showMetrics` | `mcp-vertex: Show Metrics` | **Compat** — opens the dashboard's Metrics tab. |

## Configuration

The dashboard's docs URL is read from
`mcp-vertex.config.json#extension.docsUrl`. Override:

```json
{
  "$schema": "./packages/core/schema/mcp-vertex.config.schema.json",
  "extension": {
    "docsUrl": "https://staging.mcp-vertex.dev"
  }
}
```

Defaults to `https://mcp-vertex.dev`. Localhost and private IPs are
rejected by `EmbedService` unless `allowLocalhost` /
`allowPrivateIps` is explicitly enabled.

## Development

From the workspace root:

```sh
bun install
bun run lint:brand         # verify logo.svg drift
bun run check:i18n:ide      # 12 langs × 39 keys parity
bun run --cwd extensions/vscode type
bun run --cwd extensions/vscode test
bun run --cwd extensions/vscode package   # produces @mcp-vertex-extension-vscode-1.0.0.vsix
```

## Troubleshooting

If the extension cannot connect, run the server command manually
from the workspace root:

```sh
bun run mcp-vertex
```

Then:

```sh
cd extensions/vscode
bun run type
bun run test
bun run package
```

If the dashboard is empty, click the status bar item (or run
`mcp-vertex: Refresh`); the issue is usually a transient stdio
hiccup. If the status bar is red, click it to open the dashboard
or run `mcp-vertex: Restart MCP Server`.

If the docs tab shows a rejection error, check `extension.docsUrl` in
`mcp-vertex.config.json` — `http://`, `localhost`, and private IPs
are blocked by default.