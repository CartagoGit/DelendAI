# Changelog

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
