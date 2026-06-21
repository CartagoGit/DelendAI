# Changelog

## 0.3.0

- **f126 — Logs in real time** — the dashboard's `Logs` panel
  subscribes to `logs_subscribe` and correlates every log event with
  the tool calls that fired within ±5s (via
  `NotificationLogsBridge`). Every payload is redacted through the
  shared `redactSecrets` rule set.
- **f126 — Search everywhere** — `mcp-vertex.toolSearch` opens a
  QuickPick over the live tool registry + knowledge entries. Hit Enter
  on a tool to invoke it; hit Enter on a knowledge entry to preview
  its body.
- **f126 — Knowledge navigator** — `mcp-vertex.openKnowledge` opens a
  category-grouped navigator webview with in-place search and a
  Markdown body preview. Entries are grouped by plugin prefix via the
  client-side `categoryOf(id)` helper.
- **f126 — Health diagnostics** — a new `Health` panel in the dashboard
  surfaces `proposals_state_health`, `proposals_proposal_stale_list`
  and `proposals_agent_names` aggregated into a single
  `IHealthSnapshot`. The status bar's `Status` tile shows
  `Healthy` / `Degraded`, and the queue + active agents are broken
  down by their respective KPI tiles.
- **f126 — Connection-health status bar** — `ConnectionHealthService`
  pings the server every 5s with `status-marker_ping`, emits
  `up` / `down` / `retrying` events via an EventTarget-style API, and
  is paired with a new `mcp-vertex.restartServer` command.
- **New client services** — `LogsService`, `NotificationLogsBridge`,
  `SearchService`, `HealthService`, `ConnectionHealthService` are
  exported from `@mcp-vertex/client` and use only the existing MCP
  tool surface — no new plugins.
- **i18n parity** — `IExtensionTranslations` extended from 29 to
  **39 keys** (commands + Health tab labels + KPI labels). All 12
  languages (ar, de, en, es, fr, hi, it, ja, pt, th, vi, zh) ship
  the new keys; enforced by `bun run check:i18n:ide`.
- **Multi-host impact** — every new service is implemented in
  `apps/ide/` or `packages/client/`, with the VS Code extension
  consuming them through the `IHostAdapter` seam. JetBrains, Zed,
  Cursor and Antigravity hosts get the new functionality for free by
  implementing the same adapter.

## 0.2.0

- **f125 — Dashboard webview** — branded 8-panel dashboard replaces
  the JSON-only `showOverview` / `showMetrics` webviews. Panels:
  Overview, Metrics, Tokens, Tools, Plugins, Sessions, Times, Agents.
  Logo and palette mirror `apps/web/public/logo.svg`.
- **Cross-IDE abstraction** — new `apps/ide/` workspace with
  `IHostAdapter` interface and the `VscodeHostAdapter` reference impl.
  Other IDE hosts (JetBrains, Zed, Cursor, Antigravity) ship the same
  dashboard by implementing a thin adapter.
- **Web-embed docs** — `mcp-vertex.openDocs` opens the configured
  docs URL (`mcp-vertex.config.json#extension.docsUrl`, default
  `https://mcp-vertex.dev`) in a webview; localhost + private IPs
  rejected by default.
- **Status bar upgrade** — now shows
  `$(mcp-vertex) mcp-vertex • N tools • M proposals • 12.3k tok •
  K agents`. Click → open the dashboard.
- **Activity bar icon** — brand logo (`apps/vscode/media/logo.svg`)
  ships as the activity bar entry for the `mcp-vertex` view container.
- **i18n parity** — `IExtensionTranslations` extended to 29 keys
  (commands + dashboard tabs + KPI labels). All 12 languages
  (ar, de, en, es, fr, hi, it, ja, pt, th, vi, zh) parity-checked by
  `bun run check:i18n:ide`.
- **Brand drift guard** — `bun run lint:brand` verifies that
  `apps/vscode/media/logo.svg` is byte-identical to
  `apps/web/public/logo.svg`.
- **DashboardService** — new client-side aggregator that derives all
  8 panel models in a single round-trip from
  `mcp-vertex_overview`, `mcp-vertex_metrics`,
  `proposals_proposal_board` and `proposals_agent_names`.
- **EmbedService** — HTTPS-only docs URL validation with
  `allowLocalhost` / `allowPrivateIps` escape hatches.
- **Backward compatibility** — `mcp-vertex.showOverview` and
  `mcp-vertex.showMetrics` are kept as compat shims that open the
  dashboard on the Overview / Metrics tabs.

## 0.1.0

- Initial VS Code extension scaffold.
- Adds generic `@mcp-vertex/client` integration.
- Adds overview, validation, proposals, metrics, tree providers and
  status bar.