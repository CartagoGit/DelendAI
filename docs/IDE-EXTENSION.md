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
- **8-panel dashboard webview**:
  1. **Overview** — server identity, plugins, tools, recommended
     next action.
  2. **Metrics** — per-tool calls/errors/latency with sparklines.
  3. **Tokens** — tokens used, tokens saved (vs compact), savings %.
  4. **Tools** — sortable table of every tool with its metric row.
  5. **Plugins** — per-plugin rollup + token share bar chart.
  6. **Sessions** — active proposals, grouped by status.
  7. **Times** — total wall, p50/p95, slowest tool, histogram.
  8. **Agents** — active agents (from `proposals_agent_names`).
- **Web-embed Docs** — the dashboard's Docs tab loads the configured
  `extension.docsUrl` (defaults to `https://mcp-vertex.dev`).
- **Branded status bar** —
  `$(mcp-vertex) mcp-vertex • 32 tools • 7 proposals • 12.3k tok • 4 agents`,
  click → open dashboard.
- **Activity bar icon** — the brand logo is the activity bar icon
  for the `mcp-vertex` container.
- **Notifications** — `lock-released`, `cap`, `bloqueado` events
  re-render the dashboard and status bar live.
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
                │ - KnowledgeService     │
                │ - MetricsService       │
                │ - EmbedService         │
                └──────────┬─────────────┘
                           │ typed JS objects
                           ▼
                ┌────────────────────────┐
                │ @mcp-vertex/ide        │
                │ - renderDashboard      │
                │ - 8 panel renderers    │
                │ - sparkline, barChart  │
                └──────────┬─────────────┘
                           │ HTML strings
                           ▼
                ┌────────────────────────┐
                │ apps/vscode            │
                │ - VscodeHostAdapter    │
                │ - Dashboard command    │
                │ - Status bar           │
                │ - Tree views           │
                └────────────────────────┘
```

## Brand assets

The extension uses the same logo as the docs site:
[`apps/web/public/logo.svg`](../apps/web/public/logo.svg). The asset
is **copied byte-identically** to
[`apps/vscode/media/logo.svg`](../apps/vscode/media/logo.svg) and
verified by `bun run lint:brand`.

A monochrome variant
([`apps/vscode/media/logo-mono.svg`](../apps/vscode/media/logo-mono.svg))
is shipped for low-contrast themes. The palette is defined as CSS
custom properties in
[`apps/vscode/media/dashboard.css`](../apps/vscode/media/dashboard.css)
and falls back to VS Code theme variables when running inside the
editor.

## Commands

| Command id | Title | Purpose |
|---|---|---|
| `mcp-vertex.openDashboard` | `mcp-vertex: Open Dashboard` | Open the branded 8-panel webview. |
| `mcp-vertex.openDocs` | `mcp-vertex: Open Documentation` | Open the configured docs URL in an iframe. |
| `mcp-vertex.refresh` | `mcp-vertex: Refresh` | Re-fetch the registry + metrics + proposals. |
| `mcp-vertex.runValidation` | `mcp-vertex: Run Validation` | Run `mcp-vertex_get_validation_matrix` + `quality_run_quality` (dry). |
| `mcp-vertex.openProposal` | `mcp-vertex: Open Proposal Board` | Show `proposals_proposal_board`. |
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
bun run check:i18n:ide      # 12 langs × 29 keys parity
bun run --cwd apps/vscode type
bun run --cwd apps/vscode test
bun run --cwd apps/vscode package   # produces mcp-vertex-vscode-0.2.0.vsix
```

## Troubleshooting

If the extension cannot connect, run the server command manually
from the workspace root:

```sh
bun run mcp-vertex
```

Then:

```sh
cd apps/vscode
bun run type
bun run test
bun run package
```

If the dashboard is empty, click the status bar item (or run
`mcp-vertex: Refresh`); the issue is usually a transient stdio
hiccup.

If the docs tab shows a rejection error, check `extension.docsUrl` in
`mcp-vertex.config.json` — `http://`, `localhost`, and private IPs
are blocked by default.
