# IDE Extension

The `@delendai` IDE extension ships as a VS Code extension today and
is designed to be **portable** to JetBrains, Zed, Cursor and
Antigravity through the `IHostAdapter` seam. See
[`CROSS-IDE.md`](CROSS-IDE.md) for the cross-IDE guide.

## What you get

The extension is a **branded observability cockpit** for any running
`delendai` MCP server. It connects over stdio via
[`@delendai/client`](../../packages/client) and surfaces:

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
- **Knowledge navigator** (f126) — `delendai.openKnowledge`
  opens a category-grouped navigator webview with in-place search
  and a Markdown body preview.
- **Tool search** (f126) — `delendai.toolSearch` opens a
  QuickPick over the live tool registry + knowledge entries.
- **Web-embed docs** — the dashboard's Docs tab loads the configured
  docs URL (defaults to `https://delendai.dev`).
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
                │ @delendai/core       │
                │ (MCP server, stdio)    │
                └──────────┬─────────────┘
                           │ JSON-RPC over stdio
                           ▼
                ┌────────────────────────┐
                │ @delendai/client     │
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
                │ @delendai/ui-extension│
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
[`apps/web/public/logo.svg`](../../apps/web/public/logo.svg). The asset
is **copied byte-identically** to
[`extensions/vscode/media/logo.svg`](../../extensions/vscode/media/logo.svg) and
verified by `bun run lint:brand`.

A monochrome variant
([`extensions/vscode/media/logo-mono.svg`](../../extensions/vscode/media/logo-mono.svg))
is shipped for low-contrast themes. The palette is defined as CSS
custom properties in
[`extensions/vscode/media/dashboard.css`](../extensions/vscode/media/dashboard.css)
and falls back to VS Code theme variables when running inside the
editor.

## Commands

| Command id | Title | Purpose |
|---|---|---|
| `delendai.openDashboard` | `delendai: Open Dashboard` | Open the branded 9-panel webview. |
| `delendai.openDocs` | `delendai: Open Documentation` | Open the configured docs URL in an iframe. |
| `delendai.openKnowledge` | `delendai: Open Knowledge Navigator` | Browse + preview the server's knowledge entries. |
| `delendai.toolSearch` | `delendai: Search Tools` | Fuzzy-substring match over the tool registry. |
| `delendai.refresh` | `delendai: Refresh` | Re-fetch the registry + metrics + proposals. |
| `delendai.runValidation` | `delendai: Run Validation` | Run `delendai_get_validation_matrix` + `quality_run_quality` (dry). |
| `delendai.openProposal` | `delendai: Open Proposal Board` | Show `proposals_proposal_board`. |
| `delendai.restartServer` | `delendai: Restart MCP Server` | Re-spawn the stdio process. |
| `delendai.showOverview` | `delendai: Show Overview` | **Compat** — opens the dashboard's Overview tab. |
| `delendai.showMetrics` | `delendai: Show Metrics` | **Compat** — opens the dashboard's Metrics tab. |

## Configuration

The dashboard's docs URL is read from
`delendai.config.json#extension.docsUrl`. Override:

```json
{
  "$schema": "./packages/core/schema/delendai.config.schema.json",
  "extension": {
    "docsUrl": "https://staging.delendai.dev"
  }
}
```

Defaults to `https://delendai.dev`. Localhost and private IPs are
rejected by `EmbedService` unless `allowLocalhost` /
`allowPrivateIps` is explicitly enabled.

### Namespace-aware client (f00081)

The host namespaces every tool as `<prefix><tool>` — `delendai_overview`,
`delendai_metrics`, and so on. The default prefix is `delendai_`, but a
server started with `--prefix=acme` namespaces every tool as `acme_overview`,
`acme_metrics`, … The extension reads that prefix from
`delendai.server.prefix` and threads it into every client service, so the
status bar, toolbar, overview and dashboard all call the correctly-namespaced
tools instead of silently failing on a non-default deployment.

```json
{
  "delendai.server.command": "bun",
  "delendai.server.args": ["run", "delendai", "--prefix=acme"],
  "delendai.server.prefix": "acme"
}
```

The prefix flow is:

1. The server reports its prefix in `delendai_overview { compact: true }`
   (the `namespacePrefix` field).
2. `resolveNamespacePrefix` reads `delendai.server.prefix` at activation.
3. Each service composes its tool names with `formatToolName(prefix, suffix)`.

Leave `delendai.server.prefix` empty to keep the default `delendai_`
namespace (existing deployments are unaffected). See
[`packages/client/README.md`](../../packages/client/README.md) for the
service-level API.

### Configure the issues plugin

If this is a fresh repo or the extension loads `delendai` without the GitHub issues tools you expect, follow [CROSS-PROJECT-SETUP.md](./CROSS-PROJECT-SETUP.md). That guide is the canonical path for choosing `--preset=full` versus `--plugins=proposals,issues`, writing `plugins.issues.options.repo` in `delendai.config.json`, and verifying whether the host is running on `gh`, `rest-authed`, or anonymous GitHub access.

## Development

From the workspace root:

```sh
bun install
bun run lint:brand         # verify logo.svg drift
bun run check:i18n:ide      # 12 langs × 39 keys parity
bun run --cwd extensions/vscode type
bun run --cwd extensions/vscode test
bun run --cwd extensions/vscode package   # produces delendai-vscode-1.0.0.vsix (flat name; displayName is @delendai/extension-vscode)
```

## Troubleshooting

If the extension cannot connect, run the server command manually
from the workspace root:

```sh
bun run delendai
```

Then:

```sh
cd extensions/vscode
bun run type
bun run test
bun run package
```

If the dashboard is empty, click the status bar item (or run
`delendai: Refresh`); the issue is usually a transient stdio
hiccup. If the status bar is red, click it to open the dashboard
or run `delendai: Restart MCP Server`.

If the docs tab shows a rejection error, check `extension.docsUrl` in
`delendai.config.json` — `http://`, `localhost`, and private IPs
are blocked by default.
## Shared UI surface

The extension is built on top of two layered packages:

```
apps/shared/                  @delendai/shared         design tokens, themes, brand assets, i18n contract
packages/ui-extension/         @delendai/ui-extension   host-agnostic webview components (header, dropdown, language picker, disclosure, toast, toolbar)
extensions/vscode/             delendai-vscode          the VS Code host (only file that imports `vscode`)
```

- **Header bar** — every webview (`delendai.dashboard`,
  `delendai.knowledge`, `delendai.settings`,
  `delendai.toolDetail`, `delendai.toolbar`) renders the same
  `renderHeaderBar({ brandName, version, … })` from
  `@delendai/ui-extension`. Brand SVG is inline (no asset
  dependency at runtime).
- **Language picker** — a `renderLanguagePicker` is rendered in
  the header strip; `IHostAdapter.setLanguage(lang)` + a
  `globalState['delendai:lang']` persist the choice. The shared
  `localStorage['delendai:lang']` is the cross-host fallback.
- **Dropdown** — `renderDropdown` is a CSS-transition (180ms
  ease-out) dropdown with outside-click + `Esc` close, driven by
  the runtime's `data-delendai-action` delegation.
- **Disclosure** — `<details>`/`<summary>` for collapsible
  sections; works without the runtime attached.
- **Toast** — for the in-extension notification surface.
- **Toolbar** — the new `delendai.toolbar` activity-bar entry
  surfaces the 10 canonical quick actions
  (`proposals.*`, `knowledge.*`, `logs.*`, `docs.*`, `quality.*`,
  `git.*`, `memory.*`, `notification.*`, `deps.*`, `web.*`) as
  cards grouped by category. Hosts can extend the set via
  `additionalQuickActions`.

**Brand assets live under `apps/shared/brand/`** (the single source
of truth for `logo.svg` and `logo-mono.svg`). They are regenerated
into per-host `media/` directories by
`bun run sync:brand-assets`, which runs as part of `bun run build`.
The `bun run lint:brand-hex` gate fails the build if the brand hex
literals `#58a6ff` or `#a371f7` leak outside the canonical
`_themes.scss` + `shared.ts` + the lint script itself.
