# mcp-vertex VS Code

VS Code client for a local `mcp-vertex` MCP server.

## Features

- **Branded Dashboard** — `mcp-vertex: Open Dashboard` opens an
  9-panel webview (8 KPIs + the new **Health** panel) with the
  project logo, a KPI strip, per-tool metrics, token usage, plugin
  breakdowns, active sessions, latency histogram, active agents,
  proposal / queue / stale-agent diagnostics and an embedded Docs tab.
- **Knowledge navigator** — `mcp-vertex: Open Knowledge Navigator`
  opens a category-grouped navigator with in-place search and a
  Markdown body preview.
- **Tool search** — `mcp-vertex: Search Tools` opens a QuickPick
  over the live tool registry + knowledge entries. Hit Enter on a
  tool to invoke it; hit Enter on a knowledge entry to preview its
  body.
- **Connection-health status bar** — the status bar flips to
  `$(circle-red)` when the stdio drops. Click → open the dashboard.
  `mcp-vertex: Restart MCP Server` re-spawns the server.
- **Tool tree** — server → plugins → tools, with hover descriptions
  from `knowledge`.
- **Proposal board tree** — every proposal grouped by operational
  status.
- **Activity bar icon** — the brand logo is the activity bar entry
  for the `mcp-vertex` container.
- **Web-embed docs** — `mcp-vertex: Open Documentation` opens the
  configured docs URL (`mcp-vertex.config.json#extension.docsUrl`,
  default `https://mcp-vertex.dev`) inside an iframe.
- **i18n** — 12 languages parity-checked by `bun run check:i18n:ide`.

## Screenshots (placeholder)

> Coming soon — see `docs/IDE-EXTENSION.md` for the data flow and
> the 9-panel reference.

## Development

- `bun run type` checks the extension sources.
- `bun run test` runs the mock-based smoke and provider tests.
- `bun run build` bundles `src/extension.ts` to `dist/extension.js`.
- `bun run package` builds a local `.vsix`.

The extension talks to the server over stdio through
[`@mcp-vertex/client`](../../packages/client/) and the
[IDE-agnostic dashboard](../../apps/ide/); it does not embed server
runtime logic.

## Cross-IDE

This extension is the reference implementation of the `IHostAdapter`
seam. New IDE hosts (JetBrains, Zed, Cursor, Antigravity) ship the
**same dashboard** by implementing a thin adapter against the
interface declared in
[`apps/ide/src/host-adapter.types.ts`](../../apps/ide/src/host-adapter.types.ts).
See [`docs/CROSS-IDE.md`](../../docs/CROSS-IDE.md) for the full
guide.

## Commands

| Command id | Title |
|---|---|
| `mcp-vertex.openDashboard` | mcp-vertex: Open Dashboard |
| `mcp-vertex.openDocs` | mcp-vertex: Open Documentation |
| `mcp-vertex.openKnowledge` | mcp-vertex: Open Knowledge Navigator |
| `mcp-vertex.toolSearch` | mcp-vertex: Search Tools |
| `mcp-vertex.restartServer` | mcp-vertex: Restart MCP Server |
| `mcp-vertex.refresh` | mcp-vertex: Refresh |
| `mcp-vertex.runValidation` | mcp-vertex: Run Validation |
| `mcp-vertex.openProposal` | mcp-vertex: Open Proposal Board |
| `mcp-vertex.showOverview` | mcp-vertex: Show Overview (compat → dashboard) |
| `mcp-vertex.showMetrics` | mcp-vertex: Show Metrics (compat → dashboard) |