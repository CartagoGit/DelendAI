---
id: f125
status: ready
type: proposal
track: apps+client+docs
date: 2026-06-21
kind: feat
title: IDE extension v2 — multi-IDE abstraction + branded dashboard + web embed + observability panels
shipped-in: []
reservedFiles:
    - apps/ide/
    - apps/vscode/
    - apps/vscode/media/
    - apps/vscode/src/dashboard/
    - apps/vscode/src/panels/
    - apps/vscode/src/embeds/
    - apps/vscode/src/commands/
    - apps/vscode/src/providers/
    - apps/vscode/src/views/
    - apps/vscode/src/i18n/
    - apps/vscode/scripts/check-i18n.ts
    - packages/client/
    - packages/client/src/lib/services/
    - docs/IDE-EXTENSION.md
    - docs/CROSS-IDE.md
    - docs/proposals/done/feats/f114-feat-ide-extension-vscode-and-friends.md
related:
    - f114 # v1 — generic client + tree + webviews (closed)
    - f115 # logs plugin — source for "logs" panel
    - f100 # i18n baseline — dashboard mirrors the language list
    - f101 # capabilities surface — extension is the IDE counterpart
    - f110 # residual p100 web & i18n — same i18n rules
    - l121 # plugin-depth extension — feeds new "tool usage" panel
ownership:
    - {
          agent: implementation_runner,
          task: 'S1-S2: cross-IDE abstraction in apps/ide/ + IDE-agnostic DashboardService / PanelRegistry / EmbedService in packages/client',
      }
    - {
          agent: implementation_runner,
          task: 'S3-S6: brand assets (logo, palette, typography) under apps/vscode/media/ + 8 new dashboard panels (Overview, Metrics, Tokens, Tools, Plugins, Sessions, Times, Agents)',
      }
    - {
          agent: implementation_runner,
          task: 'S7: Web-Embed webview that loads the deployed docs site (configurable URL, default https://mcp-vertex.dev)',
      }
    - {
          agent: implementation_runner,
          task: 'S8-S9: command palette wiring + activity bar entry + status bar upgrade + i18n for all 12 languages + check-i18n extension',
      }
    - {
          agent: implementation_runner,
          task: 'S10-S11: tests (DashboardService spec + PanelRegistry spec + 8 panel specs + Dashboard WebView spec) + bun run validate + .vsix packaging',
      }
globalGate: lint
acceptance:
    - { command: bun run type, expect: exit0 }
    - { command: bun run test, expect: exit0 }
    - { command: bun run lint, expect: exit0 }
    - { command: bun run site:strict, expect: exit0 }
    - { command: bun run lint:proposals, expect: exit0 }
    - { command: cd apps/vscode && bun run package, expect: exit0 }
    - { command: bun run check:i18n:ide, expect: exit0 }
    - { command: bun run lint:cross-ide, expect: exit0 }
---

# f125 — IDE extension v2: multi-IDE shell + branded dashboard + web embed + observability panels

## goal

Promote `@mcp-vertex/client` + the existing VS Code extension (`apps/vscode`) from a
"single-IDE view of the registry" to a **multi-IDE, branded observability cockpit**:

1. **Cross-IDE abstraction** — extract an IDE-agnostic UI shell under
   `apps/ide/` so the same dashboard, panels, command palette entries, status
   bar, knowledge explorer and metrics views can be shipped to JetBrains,
   Zed, Cursor and Antigravity **without rewriting anything under
   `packages/core` or any plugin**. VS Code stays the reference host; the
   other hosts only have to provide a thin `IHostAdapter` (~80 LoC) that
   binds the shell to their own webview / tree / status-bar primitives.

2. **Branded, multi-section Dashboard** — replace the current JSON-only
   `showOverview` webview with a real dashboard webview: project logo
   (`apps/web/public/logo.svg` reused), brand palette, 8 panels:
   Overview, Metrics, Tokens, Tools-Used, Plugins, Sessions, Times, Agents.
   Each panel is a real visual surface (not a `<pre>` dump) with:
   - bar charts (no chart library — inline SVG, mirroring
     `apps/vscode/src/views/metrics-sparkline.ts`),
   - sparklines,
   - KPI tiles with delta arrows,
   - a sortable tools table.

3. **Embedded documentation** — a `Web-Embed` webview that loads the
   deployed docs site (`https://mcp-vertex.dev` by default, configurable
   via `mcp-vertex.config.json#extension.docsUrl`). Plus a **Knowledge
   panel** that surfaces `mcp-vertex_knowledge` results inside the IDE
   without the user having to leave the editor.

4. **Per-tool, per-plugin, per-session observability** — the dashboard
   surfaces everything the metrics plugin already records
   (`<prefix>_metrics`): per-tool calls, errors, total/max latency,
   response bytes. Tokens used = `bytes / 4` (industry-standard
   approximation); tokens saved = `compact_response_bytes / 4`. Both
   numbers are aggregated globally, per-plugin and per-tool.

5. **i18n for all 12 languages** already in `apps/web/src/i18n/ui.ts`:
   `ar, de, en, es, fr, hi, it, ja, pt, th, vi, zh`. The existing
   `apps/vscode/scripts/check-i18n.ts` is extended to enforce parity on
   the new keys (panel titles, KPI labels, table headers, error toasts).

## why

`f114` shipped the MVP — tree, webviews, status bar — but it is
**two things short of a real product**:

1. **No brand, no "observability cockpit" feel.** Right now opening the
   extension shows `<pre>{JSON}</pre>`. The user has explicitly asked
   for "esteticamente bonita" — a real visual surface that uses the
   logo, the project name, and is pleasant to look at for an hour of
   debugging an agent loop.
2. **No data the user actually wants to see.** Metrics are summarised in
   one line on the status bar; tokens used/saved are nowhere; tools used
   per-session are nowhere; agent names are nowhere; plugin
   contributions to latency are nowhere. The data is already on the
   server (`<prefix>_metrics`, `proposals_compact_status`,
   `memory_recall`, `notification_notify_status`) — the IDE just doesn't
   surface it.
3. **Locked to VS Code.** The whole `apps/vscode/src/extension.ts` is
   one big `vscode` import. The moment we want a JetBrains plugin we
   copy-paste it. That's exactly the drift the client library was
   supposed to prevent.

## non-goals

- **No new MCP plugin.** All data is already in the registry; this is a
  pure client + UI change. New tool capabilities continue to flow
  through the normal proposals workflow.
- **No auth/secret storage.** Same scope as f114; auth is a follow-up
  proposal (deferred to `f116` lineage).
- **No codeLens over tool calls in user code** — that needs an inverse
  index that the metrics plugin does not yet expose; punt to f127+.
- **No bundling of the server inside the extension.** Same as f114.
- **No telemetry of our own.** We display metrics; we do not phone home.

## architecture

### 2.1 Layered architecture

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
                │ - OverviewService      │
                │ - NotificationsService │
                │ - MetricsService       │
                │ - KnowledgeService     │
                │ - ProposalsService     │   ← new in this proposal
                │ - DashboardService     │   ← new (aggregates all)
                │ - PanelRegistry        │   ← new (host-agnostic)
                │ - EmbedService         │   ← new (web embed helper)
                └──────────┬─────────────┘
                           │ typed JS objects
                           ▼
                ┌────────────────────────┐
                │ apps/ide/  (NEW)       │
                │ IDE-agnostic UI shell: │
                │  - dashboard webview   │
                │  - 8 panels (pure JS)  │
                │  - brand assets        │
                │  - command palette     │
                │  - IHostAdapter seam   │
                └──────────┬─────────────┘
                           │ implements IHostAdapter
            ┌──────────────┼──────────────┬──────────────┐
            ▼              ▼              ▼              ▼
      ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
      │ vscode   │  │ jetbrains│  │ zed      │  │ cursor   │  ← future
      │  (live)  │  │ (future) │  │ (future) │  │ (future) │
      └──────────┘  └──────────┘  └──────────┘  └──────────┘
```

### 2.2 Hard rules (cannot be broken)

- **`packages/core` stays agnostic.** No `vscode`, `jetbrains`,
  `cursor`, `zed` or other host import may appear under `packages/core`
  or any plugin. The lint rule from f114 is preserved.
- **`packages/client` stays IDE-agnostic.** No `@vscode/*`,
  `com.intellij.*`, `zed_extension_api` etc. `apps/ide/` and `apps/vscode/`
  are the only places host APIs may be imported.
- **`apps/ide/` is host-agnostic UI.** It produces **strings of HTML +
  CSS + minimal vanilla JS** (already the convention in f114) plus a
  typed `IHostAdapter` interface. Each IDE host implements the adapter
  and consumes the strings. **No React/Vue/Preact** — the dependency
  budget is already tight and `apps/web` uses Astro for that.
- **`apps/vscode/` is the reference implementation** of the adapter. It
  also keeps all existing v1 commands (`showOverview`, `refresh`,
  `runValidation`, `openProposal`, `showMetrics`) as **backward-compatible
  thin shims** over the new dashboard, so anyone scripting the extension
  via `vscode.commands.executeCommand('mcp-vertex.showMetrics')` still
  works.
- **Brand assets live in `apps/vscode/media/`.** They are exposed via
  the `vscode-webview-resource:` URI scheme (already supported by VS
  Code webviews). Other IDE hosts use their own asset pipeline; the SVG
  bytes are inlined into the dashboard HTML for portability.
- **i18n parity.** Every new visible string is added to **all 12**
  dictionaries in `apps/vscode/src/i18n/langs/`. The CI gate
  `bun run check:i18n:ide` fails if any dictionary is missing the key.

### 2.3 `IHostAdapter` interface (single seam)

```ts
// apps/ide/src/host-adapter.types.ts
export interface IHostAdapter {
  readonly id: 'vscode' | 'jetbrains' | 'zed' | 'cursor' | string;
  readonly displayName: string;

  registerTreeDataProvider(viewId: string, provider: ITreeDataProvider): IDisposable;
  registerCommand(id: string, cb: (...args: readonly unknown[]) => unknown): IDisposable;
  createWebviewPanel(viewType: string, title: string, viewColumn: number, opts: {
    enableScripts?: boolean;
    localResourceRoots?: readonly string[];
  }): IWebviewPanel;
  createStatusBarItem(alignment?: 'left' | 'right', priority?: number): IStatusBarItem;
  showInformationMessage(message: string): Thenable<string | undefined>;
  openTextDocument(uri: string): Thenable<unknown>;
  revealInExplorer(uri: string): Thenable<void>;
  onDidChangeConfiguration(cb: (e: { affectsConfiguration(s: string): boolean }) => void): IDisposable;
  getConfiguration<T>(section: string): T;
  registerWebviewViewProvider?(viewId: string, provider: IWebviewViewProvider): IDisposable;
  // … see slices for the full ~12-method surface.
}
```

Every host implements this. The dashboard code calls `host.xxx()` and
never touches `vscode.*`. The IDE-agnostic dashboard is exercised
**without any IDE** by a fake adapter in unit tests (the same pattern
already used in `apps/vscode/src/test/`).

### 2.4 Dashboard panels (8)

All panels render into a single webview (tabbed) so the dashboard stays
**one-click**, **non-blocking**, and **pinnable**. Each panel is a pure
function `renderPanelX(model, t): string` → HTML. A small client-side
`<script>` handles tab switching and "Refresh" without re-creating the
panel.

| # | Panel id        | Data source(s)                                               | What it shows                                                              |
|---|-----------------|--------------------------------------------------------------|----------------------------------------------------------------------------|
| 1 | `overview`      | `<prefix>_overview`                                          | Server name/version, plugins count, tools count, recommended next action.  |
| 2 | `metrics`       | `<prefix>_metrics` (poll every 5 s)                          | Per-tool KPIs, calls/errors, sparkline of `totalMs` per minute.            |
| 3 | `tokens`        | `<prefix>_metrics` (bytes / 4) + `<prefix>_overview` (compact vs full) | Tokens used, tokens saved (compact vs full), savings %. Top 10 by tokens. |
| 4 | `tools`         | `<prefix>_metrics`                                           | Sortable table: tool, plugin, calls, errors, avg ms, tokens, sparkline.    |
| 5 | `plugins`       | `<prefix>_overview` + `<prefix>_metrics`                     | Per-plugin summary: tool count, total calls, p50/p95 latency, token share. |
| 6 | `sessions`      | `proposals_compact_status`                                   | Active proposals (in_progress / ready / blocked), per-proposal lock holder. |
| 7 | `times`         | `<prefix>_metrics` (maxMs, totalMs, delta)                   | Total wall-clock, slowest tool, latency histogram (SVG bars).               |
| 8 | `agents`        | `proposals_agent_names`                                      | Active agents, their current proposal/slice, lock state, last heartbeat.   |

A **9th view** — not a panel, but a tab — is the `docs` **Web Embed** that
loads the configured docs URL (default `https://mcp-vertex.dev`).

### 2.5 Brand identity

- **Logo**: copy `apps/web/public/logo.svg` into
  `apps/vscode/media/logo.svg` (byte-identical). Inline in the
  dashboard header so it renders without an extra HTTP fetch.
- **Palette**: derive a small palette from the logo's existing gradient
  `#58a6ff → #a371f7` and the GitHub-dark / VS Code-dark backgrounds
  already used in `apps/web/src/styles/`. Define as CSS custom
  properties in `apps/vscode/media/dashboard.css` so themes can
  override.
- **Typography**: `--vscode-font-family` for prose; tabular nums
  (`font-variant-numeric: tabular-nums`) on every KPI / table number so
  digits don't shimmy when streaming.
- **Layout**: 12-column CSS grid; panels stack on viewports < 900 px.
  Cards have a 1 px hairline border (`--vscode-widget-border`) plus a
  subtle gradient stripe at the top echoing the logo.
- **Logo on the title bar**: VS Code extension `contributes.icon` set to
  the same SVG (via `Media` path) so the extension has a brand icon in
  the activity bar.

## slices

Each slice ends green (`bun run validate`), ships a Conventional
Commit, and updates this proposal's `shipped-in` list in `index.json`.

### S1 — `apps/ide/` scaffold + `IHostAdapter` types _(excl. `apps/vscode/`, `apps/`, `docs/`)_

- **Status**: ready
- **Files**:
  - `apps/ide/package.json`
  - `apps/ide/tsconfig.json`
  - `apps/ide/vitest.config.ts`
  - `apps/ide/src/host-adapter.types.ts`
  - `apps/ide/src/public/index.ts`
  - `apps/ide/tests/host-adapter.types.spec.ts`
  - `apps/ide/tests/fake-host-adapter.ts`
- New workspace `apps/ide/` mirroring `apps/web/package.json` shape
  (depends on `@mcp-vertex/client` for types).
- `host-adapter.types.ts` declares the full interface (12 methods)
  documented in §2.3.
- `tests/fake-host-adapter.ts` provides an in-memory implementation
  with spy counters — used by every other slice's tests.
- `tests/host-adapter.types.spec.ts` enforces compile-time exhaustiveness
  (`satisfies IHostAdapter` on the fake).
- **Command**: `bun run test apps/ide`.
- **Expect**: exit 0.

### S2 — `DashboardService` + `PanelRegistry` + `EmbedService` in `@mcp-vertex/client` _(excl. `apps/`, `docs/`)_

- **Status**: ready
- **Files**:
  - `packages/client/src/lib/services/proposals-service.ts`
    - `listProposals()`, `getProposal(id)`, `compactStatus()`
  - `packages/client/src/lib/services/dashboard-service.ts`
    - `getOverviewModel(): Promise<IDashboardOverview>`
    - `getMetricsModel(opts: { since?: number }): Promise<IDashboardMetricsModel>`
    - `getTokensModel(): Promise<IDashboardTokensModel>`
    - `getToolsModel(): Promise<IDashboardToolsModel>`
    - `getPluginsModel(): Promise<IDashboardPluginsModel>`
    - `getSessionsModel(): Promise<IDashboardSessionsModel>`
    - `getTimesModel(): Promise<IDashboardTimesModel>`
    - `getAgentsModel(): Promise<IDashboardAgentsModel>`
    - `getAllModels(): Promise<IDashboardAllModels>` (single call returning all 8 models in one round-trip — used by the dashboard on open)
  - `packages/client/src/lib/services/embed-service.ts`
    - `resolveDocsUrl(config: { extension?: { docsUrl?: string } }): string` (defaults to `https://mcp-vertex.dev`)
    - `validateDocsUrl(url: string): { ok: boolean; reason?: string }` (HTTPS-only, no localhost by default, configurable)
  - `packages/client/src/lib/services/dashboard.types.ts`
    - All `IDashboard*Model` interfaces — fully typed, no `any`.
  - `packages/client/tests/services/proposals-service.spec.ts`
  - `packages/client/tests/services/dashboard-service.spec.ts` (8 model fixtures, plus a "metrics dropped" case)
  - `packages/client/tests/services/embed-service.spec.ts` (10 cases: defaults, override, http blocked, localhost blocked, …)
- **Gate**: `bun run test packages/client`; coverage on the three new services ≥ 90%.
- **Estimated work**: 1 session.

### S3 — Brand assets + dashboard CSS _(excl. `apps/vscode/src/extension.ts`, `apps/vscode/src/panels/`, `apps/vscode/src/embeds/`, `docs/`)_

- **Status**: ready
- **Files**:
  - `apps/vscode/media/logo.svg` — byte-identical copy of `apps/web/public/logo.svg`.
  - `apps/vscode/media/logo-mono.svg` — monochrome variant for low-contrast themes (auto-detected via `prefers-color-scheme`).
  - `apps/vscode/media/dashboard.css` — palette CSS variables, 12-col grid, card primitives, sparkline rules, table styles.
  - `apps/vscode/media/dashboard.html` — minimal shell with `<header>` (logo + project name + version), `<nav>` (8 tabs + Docs), `<main>` (panel container), `<footer>` (status line).
  - `apps/vscode/scripts/sync-logo.ts` — `bun run sync:logo` keeps `apps/vscode/media/logo.svg` in sync with `apps/web/public/logo.svg`. Wired to `bun run lint` via `lint:brand` (fails if drift detected).
- **Gate**: `bun run lint:brand` exit 0.
- **Estimated work**: 0.5 session.

### S4 — `apps/ide/` dashboard webview + 8 panel renderers _(excl. `apps/vscode/`, `docs/`)_

- **Status**: ready
- **Files**:
  - `apps/ide/src/dashboard/render-dashboard.ts` — top-level: header + tabs + panel container + footer.
  - `apps/ide/src/dashboard/render-panel-overview.ts`
  - `apps/ide/src/dashboard/render-panel-metrics.ts`
  - `apps/ide/src/dashboard/render-panel-tokens.ts`
  - `apps/ide/src/dashboard/render-panel-tools.ts`
  - `apps/ide/src/dashboard/render-panel-plugins.ts`
  - `apps/ide/src/dashboard/render-panel-sessions.ts`
  - `apps/ide/src/dashboard/render-panel-times.ts`
  - `apps/ide/src/dashboard/render-panel-agents.ts`
  - `apps/ide/src/dashboard/sparkline.ts` — pure helper: `sparklinePath(values: number[], width, height): string`.
  - `apps/ide/src/dashboard/bar-chart.ts` — pure helper: `barChart(bars: {label,value,max}[], w, h): string`.
  - `apps/ide/src/dashboard/format.ts` — pure helpers: `formatBytes`, `formatMs`, `formatNumber`, `formatPercent`.
  - `apps/ide/src/dashboard/client.ts` — tiny vanilla `<script>` for tab switching and refresh.
  - `apps/ide/src/public/index.ts` — re-exports the 8 `renderPanel*` functions, `renderDashboard`, and the helpers.
  - `apps/ide/tests/dashboard/*.spec.ts` — 8 spec files, one per panel; 3-5 fixture-driven cases each.
  - `apps/ide/tests/dashboard/sparkline.spec.ts` — 8 cases (constant, increasing, decreasing, NaN handling, width/height variants, …).
  - `apps/ide/tests/dashboard/bar-chart.spec.ts` — 5 cases.
  - `apps/ide/tests/dashboard/format.spec.ts` — 12 cases (bytes → B/KB/MB, ms → ms/s, percent rounding, locale-aware).
- **Gate**: `bun run test apps/ide` exit 0; visual snapshot test (regex of key DOM landmarks) per panel.
- **Estimated work**: 2 sessions.

### S5 — VS Code `IHostAdapter` implementation + activation _(excl. `apps/vscode/src/dashboard/`, `apps/vscode/src/embeds/`, `docs/`)_

- **Status**: ready
- **Files**:
  - `apps/vscode/src/host/vscode-host-adapter.ts` — implements `IHostAdapter` against the real `vscode` module; the only file in the entire codebase that imports `vscode`.
  - `apps/vscode/src/host/vscode-host-adapter.spec.ts` — uses the same `FakeHostAdapter` as `apps/ide/tests/`, exercises the real adapter against `@vscode/test-electron` (already in devDeps).
  - `apps/vscode/src/extension.ts` — updated: replaces the per-view provider wiring with a single `activate(ctx)` that:
    1. constructs `McpStdioClient`,
    2. constructs `DashboardService`,
    3. registers `VscodeHostAdapter`,
    4. registers 3 webview commands (`mcp-vertex.openDashboard`, `mcp-vertex.openDocs`, `mcp-vertex.openToolDetail`),
    5. registers 3 tree views (tools, proposals, sessions),
    6. registers the status bar,
    7. preserves all v1 commands as backward-compatible shims.
- **Gate**: `bun run test apps/vscode` exit 0; `bun run type` exit 0.
- **Estimated work**: 1.5 sessions.

### S6 — Activity bar entry + status bar upgrade _(excl. `apps/vscode/src/views/`, `apps/vscode/src/embeds/`, `docs/`)_

- **Status**: ready
- **Files**:
  - `apps/vscode/src/providers/activity-bar-icon.ts` — exposes the brand logo as the activity-bar icon for the `mcp-vertex` view container.
  - `apps/vscode/src/providers/status-bar.ts` — upgraded: now shows `$(mcp-vertex) mcp-vertex v0.1.0 • 32 tools • 7 proposals • 12.3k tok • 4 agents`, click opens the dashboard. Subscribes to `lock-released` / `cap` / `bloqueado` and re-renders.
  - `apps/vscode/src/test/status-bar.spec.ts` — extended with 4 new cases (tokens segment, agents segment, missing-data fallbacks, click handler).
- **Gate**: `bun run test apps/vscode` exit 0.
- **Estimated work**: 0.5 session.

### S7 — Web-Embed webview + Knowledge explorer panel _(excl. `apps/vscode/src/extension.ts`, `apps/vscode/src/embeds/docs-embed.tsx` placeholder, `docs/`)_

- **Status**: ready
- **Files**:
  - `apps/vscode/src/embeds/docs-embed-webview.ts` — opens a webview with `enableScripts: true`, `localResourceRoots` configured, and `src=` the resolved docs URL. Has a small header with the brand logo, the resolved URL, and a "Reload" button.
  - `apps/vscode/src/embeds/docs-embed.css` — header bar + iframe styles.
  - `apps/vscode/src/embeds/knowledge-explorer.ts` — `getKnowledge(id)` + render: title, body (rendered markdown → safe HTML via a tiny markdown subset already used in `apps/web/src/components/`), back-link.
  - `apps/vscode/src/embeds/docs-embed-webview.spec.ts` — 4 cases: default URL, override URL, http blocked, localhost blocked.
  - `apps/vscode/src/embeds/knowledge-explorer.spec.ts` — 3 cases: missing entry, present entry, markdown escaping.
  - `apps/vscode/src/commands/open-docs.ts` — `mcp-vertex.openDocs` command.
- **Gate**: `bun run test apps/vscode` exit 0.
- **Estimated work**: 1 session.

### S8 — Command palette wiring + i18n for all 12 languages _(excl. `apps/vscode/src/views/`, `apps/vscode/src/embeds/`, `apps/vscode/src/host/`, `docs/`)_

- **Status**: ready
- **Files**:
  - `apps/vscode/src/commands/open-dashboard.ts`
  - `apps/vscode/src/commands/open-docs.ts`
  - `apps/vscode/src/commands/open-tool-detail.ts` (kept from v1, now routed through the new dashboard's Tools tab).
  - `apps/vscode/src/commands/refresh.ts` (kept, now also refreshes the dashboard model).
  - `apps/vscode/src/commands/run-validation.ts` (kept).
  - `apps/vscode/src/commands/open-proposal.ts` (kept, now opens the proposal in the Sessions panel).
  - `apps/vscode/src/i18n/langs/{ar,de,en,es,fr,hi,it,ja,pt,th,vi,zh}.ts` — extended with new keys (`dashboardTitle`, `tabOverview`, `tabMetrics`, `tabTokens`, `tabTools`, `tabPlugins`, `tabSessions`, `tabTimes`, `tabAgents`, `tabDocs`, `kpiCalls`, `kpiErrors`, `kpiAvgMs`, `kpiMaxMs`, `kpiTokens`, `kpiTokensSaved`, `kpiSavings`, `tableHeaderPlugin`, `tableHeaderTool`, `tableHeaderCalls`, `tableHeaderErrors`, `tableHeaderAvgMs`, `tableHeaderTokens`, `tableHeaderSparkline`, `statusBarAgents`, `openDocs`, `openDashboard`, `openToolDetail`).
  - `apps/vscode/src/i18n/index.ts` — extended `IExtensionTranslations`.
  - `apps/vscode/scripts/check-i18n.ts` — extended: checks the new keys across all 12 langs (parity check, sorted union diff).
  - `package.json` (root) — new script `check:i18n:ide: cd apps/vscode && bun run check:i18n`.
- **Gate**: `bun run check:i18n:ide` exit 0.
- **Estimated work**: 1 session.

### S9 — Docs + cross-IDE guide _(excl. `apps/`, `packages/`, `plugins/`)_

- **Status**: ready
- **Files**:
  - `docs/CROSS-IDE.md` — explains the `IHostAdapter` seam, lists what each host must implement, gives the JetBrains / Zed / Cursor / Antigravity hosts a checklist, and links to example adapters (none exist yet; the doc points at `apps/vscode/src/host/vscode-host-adapter.ts` as the reference).
  - `docs/IDE-EXTENSION.md` — extended with: dashboard overview, screenshot placeholders, the 8 panel reference, the Web-Embed docs URL configuration, the brand asset sources, the metrics data flow, and the JetBrains/Zed/Cursor/Antigravity "next steps" checklist.
  - `apps/vscode/README.md` — extended with the dashboard feature list, screenshot placeholders, the cross-IDE note.
  - `apps/vscode/CHANGELOG.md` — new `0.2.0` entry summarising all v2 additions.
- **Gate**: `bun run site:strict` exit 0 (the new docs must be site-buildable).
- **Estimated work**: 0.5 session.

### S10 — Tests + bun run validate + .vsix packaging _(excl. `apps/vscode/src/embeds/`, `apps/vscode/src/host/`, `docs/`)_

- **Status**: ready
- **Files**:
  - `apps/vscode/src/test/dashboard-integration.spec.ts` — end-to-end: fake host adapter, real `DashboardService`, fake metrics, verifies the dashboard HTML contains the expected sections in the expected order and is safe (no `<script>` injection from tool names).
  - `apps/vscode/src/test/smoke.spec.ts` — extended with a "v1 commands still resolve" smoke (the backward-compat shim check).
  - `apps/vscode/scripts/build.ts` — extended: bundles the new entry points and the `apps/ide` source into `dist/`.
  - `apps/vscode/.vscodeignore` — extended: includes `media/`, excludes `apps/ide/tests/` from the .vsix.
- **Gate**:
  - `bun run type` exit 0.
  - `bun run test` exit 0.
  - `bun run lint` exit 0.
  - `bun run check:i18n:ide` exit 0.
  - `bun run lint:brand` exit 0.
  - `bun run lint:cross-ide` exit 0 (new; runs `bun run lint` in `apps/ide/` too).
  - `bun run site:strict` exit 0.
  - `bun run lint:proposals` exit 0.
  - `cd apps/vscode && bun run package` exit 0, produces `apps/vscode/mcp-vertex-vscode-0.2.0.vsix`.
- **Estimated work**: 1 session.

### S11 — Backward-compat shims + deprecation note for v1 commands _(excl. `apps/vscode/src/extension.ts`, `docs/`)_

- **Status**: ready
- **Files**:
  - `apps/vscode/src/commands/show-overview.ts` — kept; now opens the dashboard with the `overview` tab active.
  - `apps/vscode/src/commands/show-metrics.ts` — kept; now opens the dashboard with the `metrics` tab active.
  - `apps/vscode/src/commands/types.ts` — extended with `ICommandDeps.host` so commands can route through the adapter.
  - `apps/vscode/CHANGELOG.md` — note: `mcp-vertex.showOverview` and `mcp-vertex.showMetrics` now open the dashboard (no breaking change for users scripting the commands; visual change for users who had pinned the webviews).
- **Gate**: `bun run test apps/vscode` exit 0.
- **Estimated work**: 0.25 session.

## acceptance

- All the commands listed in `acceptance:` at the top exit 0.
- A new `apps/vscode/mcp-vertex-vscode-0.2.0.vsix` is produced.
- The dashboard webview renders 8 panels plus a Docs tab in VS Code
  without any console errors.
- The status bar shows the project name, version, tool count, proposal
  count, token count and agent count.
- The web embed loads `https://mcp-vertex.dev` by default; localhost
  and `http://` are blocked.
- The brand logo is byte-identical between `apps/web/public/logo.svg`
  and `apps/vscode/media/logo.svg` (enforced by `lint:brand`).
- Every visible string is translated to all 12 languages (enforced by
  `check:i18n:ide`).
- `docs/CROSS-IDE.md` is written; `docs/IDE-EXTENSION.md` is updated.

## notes

- **JetBrains, Zed, Cursor, Antigravity adapters.** `apps/ide/` is the
  shell; the reference adapter is `apps/vscode/`. Building the others is
  a follow-up proposal each.
- **Notifications panel.** `NotificationsService` already dispatches
  events; a panel that streams them into a live log is a great
  follow-up but out of scope here (would need a UI thread + careful
  back-pressure; defer to f126).
- **Logs panel.** Source is the `f115` logs plugin; the panel is one
  extra `render-panel-logs.ts` once `LogsService` is in the client
  (currently in `plugins/logs/src/lib/`, not yet re-exported by
  `packages/client/src/public/index.ts`). Defer to f128.
- **Auth / secret storage.** Deferred to the f116 lineage.
