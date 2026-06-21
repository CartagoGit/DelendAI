---
id: f00022
status: done
type: proposal
track: apps+client+docs
date: 2026-06-21
kind: feat
title: IDE extension v2 — multi-IDE abstraction + branded dashboard + web embed + observability panels
shipped-in:
    - 61a5f37 # feat: Rename IDE shell and relocate extensions (apps/ide -> packages/ui-extension, extensions/vscode -> extensions/vscode)
    - 3d3f21c # refactor(extensions/vscode): migrate @mcp-vertex/ide imports to @mcp-vertex/ui-extension (S5)
    - 54ccb4b # feat!: publish packages/ui-extension@1.0.0 + extensions/vscode@1.0.0 with rename CHANGELOG (S8)
    - efca64a # feat: add dashboard types and embed service for improved dashboard functionality
    - 0d66a6f # feat: implement SearchService for client-side tool and knowledge search
    - ab58acc # feat: add knowledge navigator rendering and command integration
    - 2212fbc # feat: add Health panel rendering and service
    - 3b0c9e2 # feat: add connection health service and restart server command
    - 046dce0 # Add unit tests and implement metrics rendering for mcp-vertex extension
related:
    - f00014 # v1 — generic client + tree + webviews (closed)
    - f00015 # logs plugin — source for "logs" panel
    - f00012 # i18n baseline — dashboard mirrors the language list
    - f00011 # capabilities surface — extension is the IDE counterpart
    - f00010 # residual p100 web & i18n — same i18n rules
    - f00028 # plugin-depth extension — feeds new "tool usage" panel
    - f00035 # rename apps/ide->packages/ui-extension, extensions/vscode->extensions/vscode (superseded this proposal's reservedFiles, see rationale)
globalGate: lint
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run test, expect: exit0 }
    - { command: bun run lint, expect: exit0 }
    - { command: bun run check:i18n:ide, expect: exit0 }
    - { command: bun run lint:cross-ide, expect: exit0 }
    - { command: bun run lint:brand, expect: exit0 }
---

# f00022 — IDE extension v2: multi-IDE shell + branded dashboard + web embed + observability panels

## goal

Promote `@mcp-vertex/client` + the existing VS Code extension (`extensions/vscode`) from a
"single-IDE view of the registry" to a **multi-IDE, branded observability cockpit**:

1. **Cross-IDE abstraction** — extract an IDE-agnostic UI shell under
   `packages/ui-extension/` so the same dashboard, panels, command palette entries, status
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
     `extensions/vscode/src/views/metrics-sparkline.ts`),
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
   `extensions/vscode/scripts/check-i18n.ts` is extended to enforce parity on
   the new keys (panel titles, KPI labels, table headers, error toasts).

## why

`f00014` shipped the MVP — tree, webviews, status bar — but it is
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
3. **Locked to VS Code.** The whole `extensions/vscode/src/extension.ts` is
   one big `vscode` import. The moment we want a JetBrains plugin we
   copy-paste it. That's exactly the drift the client library was
   supposed to prevent.

## non-goals

- **No new MCP plugin.** All data is already in the registry; this is a
  pure client + UI change. New tool capabilities continue to flow
  through the normal proposals workflow.
- **No auth/secret storage.** Same scope as f00014; auth is a follow-up
  proposal (deferred to `f00017` lineage).
- **No codeLens over tool calls in user code** — that needs an inverse
  index that the metrics plugin does not yet expose; punt to f00024+.
- **No bundling of the server inside the extension.** Same as f00014.
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
                ┌──────────────────────────────┐
                │ packages/ui-extension/ (NEW) │
                │ IDE-agnostic UI shell:       │
                │  - dashboard webview         │
                │  - 8 panels (pure JS)        │
                │  - brand assets              │
                │  - command palette           │
                │  - IHostAdapter seam         │
                └──────────┬───────────────────┘
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
  or any plugin. The lint rule from f00014 is preserved.
- **`packages/client` stays IDE-agnostic.** No `@vscode/*`,
  `com.intellij.*`, `zed_extension_api` etc. `packages/ui-extension/` and `extensions/vscode/`
  are the only places host APIs may be imported.
- **`packages/ui-extension/` is host-agnostic UI.** It produces **strings of HTML +
  CSS + minimal vanilla JS** (already the convention in f00014) plus a
  typed `IHostAdapter` interface. Each IDE host implements the adapter
  and consumes the strings. **No React/Vue/Preact** — the dependency
  budget is already tight and `apps/web` uses Astro for that.
- **`extensions/vscode/` is the reference implementation** of the adapter. It
  also keeps all existing v1 commands (`showOverview`, `refresh`,
  `runValidation`, `openProposal`, `showMetrics`) as **backward-compatible
  thin shims** over the new dashboard, so anyone scripting the extension
  via `vscode.commands.executeCommand('mcp-vertex.showMetrics')` still
  works.
- **Brand assets live in `extensions/vscode/media/`.** They are exposed via
  the `vscode-webview-resource:` URI scheme (already supported by VS
  Code webviews). Other IDE hosts use their own asset pipeline; the SVG
  bytes are inlined into the dashboard HTML for portability.
- **i18n parity.** Every new visible string is added to **all 12**
  dictionaries in `extensions/vscode/src/i18n/langs/`. The CI gate
  `bun run check:i18n:ide` fails if any dictionary is missing the key.

### 2.3 `IHostAdapter` interface (single seam)

```ts
// packages/ui-extension/src/host-adapter.types.ts
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
already used in `extensions/vscode/src/test/`).

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
  `extensions/vscode/media/logo.svg` (byte-identical). Inline in the
  dashboard header so it renders without an extra HTTP fetch.
- **Palette**: derive a small palette from the logo's existing gradient
  `#58a6ff → #a371f7` and the GitHub-dark / VS Code-dark backgrounds
  already used in `apps/web/src/styles/`. Define as CSS custom
  properties in `extensions/vscode/media/dashboard.css` so themes can
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

### S1 — `packages/ui-extension/` scaffold + `IHostAdapter` types _(excl. `extensions/vscode/`, `apps/`, `docs/`)_

- **Status**: done
- **Files**:
  - `packages/ui-extension/package.json`
  - `packages/ui-extension/tsconfig.json`
  - `packages/ui-extension/vitest.config.ts`
  - `packages/ui-extension/src/host-adapter.types.ts`
  - `packages/ui-extension/src/public/index.ts`
  - `packages/ui-extension/tests/host-adapter.types.spec.ts`
  - `packages/ui-extension/tests/fake-host-adapter.ts`
- New workspace `packages/ui-extension/` mirroring `apps/web/package.json` shape
  (depends on `@mcp-vertex/client` for types).
- `host-adapter.types.ts` declares the full interface (12 methods)
  documented in §2.3.
- `tests/fake-host-adapter.ts` provides an in-memory implementation
  with spy counters — used by every other slice's tests.
- `tests/host-adapter.types.spec.ts` enforces compile-time exhaustiveness
  (`satisfies IHostAdapter` on the fake).
- **Command**: `bun run test packages/ui-extension`.
- **Expect**: exit 0.

### S2 — `DashboardService` + `PanelRegistry` + `EmbedService` in `@mcp-vertex/client` _(excl. `apps/`, `docs/`)_

- **Status**: done
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

### S3 — Brand assets + dashboard CSS _(excl. `extensions/vscode/src/extension.ts`, `extensions/vscode/src/panels/`, `extensions/vscode/src/embeds/`, `docs/`)_

- **Status**: done
- **Files**:
  - `extensions/vscode/media/logo.svg` — byte-identical copy of `apps/web/public/logo.svg`.
  - `extensions/vscode/media/logo-mono.svg` — monochrome variant for low-contrast themes (auto-detected via `prefers-color-scheme`).
  - `extensions/vscode/media/dashboard.css` — palette CSS variables, 12-col grid, card primitives, sparkline rules, table styles.
  - `extensions/vscode/media/dashboard.html` — minimal shell with `<header>` (logo + project name + version), `<nav>` (8 tabs + Docs), `<main>` (panel container), `<footer>` (status line).
  - `extensions/vscode/scripts/sync-logo.ts` — `bun run sync:logo` keeps `extensions/vscode/media/logo.svg` in sync with `apps/web/public/logo.svg`. Wired to `bun run lint` via `lint:brand` (fails if drift detected).
- **Gate**: `bun run lint:brand` exit 0.
- **Estimated work**: 0.5 session.

### S4 — `packages/ui-extension/` dashboard webview + 8 panel renderers _(excl. `extensions/vscode/`, `docs/`)_

- **Status**: done
- **Files**:
  - `packages/ui-extension/src/dashboard/render-dashboard.ts` — top-level: header + tabs + panel container + footer.
  - `packages/ui-extension/src/dashboard/render-panel-overview.ts`
  - `packages/ui-extension/src/dashboard/render-panel-metrics.ts`
  - `packages/ui-extension/src/dashboard/render-panel-tokens.ts`
  - `packages/ui-extension/src/dashboard/render-panel-tools.ts`
  - `packages/ui-extension/src/dashboard/render-panel-plugins.ts`
  - `packages/ui-extension/src/dashboard/render-panel-sessions.ts`
  - `packages/ui-extension/src/dashboard/render-panel-times.ts`
  - `packages/ui-extension/src/dashboard/render-panel-agents.ts`
  - `packages/ui-extension/src/dashboard/sparkline.ts` — pure helper: `sparklinePath(values: number[], width, height): string`.
  - `packages/ui-extension/src/dashboard/bar-chart.ts` — pure helper: `barChart(bars: {label,value,max}[], w, h): string`.
  - `packages/ui-extension/src/dashboard/format.ts` — pure helpers: `formatBytes`, `formatMs`, `formatNumber`, `formatPercent`.
  - `packages/ui-extension/src/dashboard/client.ts` — tiny vanilla `<script>` for tab switching and refresh.
  - `packages/ui-extension/src/public/index.ts` — re-exports the 8 `renderPanel*` functions, `renderDashboard`, and the helpers.
  - `packages/ui-extension/tests/dashboard/*.spec.ts` — 8 spec files, one per panel; 3-5 fixture-driven cases each.
  - `packages/ui-extension/tests/dashboard/sparkline.spec.ts` — 8 cases (constant, increasing, decreasing, NaN handling, width/height variants, …).
  - `packages/ui-extension/tests/dashboard/bar-chart.spec.ts` — 5 cases.
  - `packages/ui-extension/tests/dashboard/format.spec.ts` — 12 cases (bytes → B/KB/MB, ms → ms/s, percent rounding, locale-aware).
- **Gate**: `bun run test packages/ui-extension` exit 0; visual snapshot test (regex of key DOM landmarks) per panel.
- **Estimated work**: 2 sessions.

### S5 — VS Code `IHostAdapter` implementation + activation _(excl. `extensions/vscode/src/dashboard/`, `extensions/vscode/src/embeds/`, `docs/`)_

- **Status**: done
- **Files**:
  - `extensions/vscode/src/host/vscode-host-adapter.ts` — implements `IHostAdapter` against the real `vscode` module; the only file in the entire codebase that imports `vscode`.
  - `extensions/vscode/src/host/vscode-host-adapter.spec.ts` — uses the same `FakeHostAdapter` as `packages/ui-extension/tests/`, exercises the real adapter against `@vscode/test-electron` (already in devDeps).
  - `extensions/vscode/src/extension.ts` — updated: replaces the per-view provider wiring with a single `activate(ctx)` that:
    1. constructs `McpStdioClient`,
    2. constructs `DashboardService`,
    3. registers `VscodeHostAdapter`,
    4. registers 3 webview commands (`mcp-vertex.openDashboard`, `mcp-vertex.openDocs`, `mcp-vertex.openToolDetail`),
    5. registers 3 tree views (tools, proposals, sessions),
    6. registers the status bar,
    7. preserves all v1 commands as backward-compatible shims.
- **Gate**: `bun run test extensions/vscode` exit 0; `bun run type` exit 0.
- **Estimated work**: 1.5 sessions.

### S6 — Activity bar entry + status bar upgrade _(excl. `extensions/vscode/src/views/`, `extensions/vscode/src/embeds/`, `docs/`)_

- **Status**: done
- **Files**:
  - `extensions/vscode/src/providers/activity-bar-icon.ts` — exposes the brand logo as the activity-bar icon for the `mcp-vertex` view container.
  - `extensions/vscode/src/providers/status-bar.ts` — upgraded: now shows `$(mcp-vertex) mcp-vertex v0.1.0 • 32 tools • 7 proposals • 12.3k tok • 4 agents`, click opens the dashboard. Subscribes to `lock-released` / `cap` / `bloqueado` and re-renders.
  - `extensions/vscode/src/test/status-bar.spec.ts` — extended with 4 new cases (tokens segment, agents segment, missing-data fallbacks, click handler).
- **Gate**: `bun run test extensions/vscode` exit 0.
- **Estimated work**: 0.5 session.

### S7 — Web-Embed webview + Knowledge explorer panel _(excl. `extensions/vscode/src/extension.ts`, `extensions/vscode/src/embeds/docs-embed.tsx` placeholder, `docs/`)_

- **Status**: done
- **Files**:
  - `extensions/vscode/src/embeds/docs-embed-webview.ts` — opens a webview with `enableScripts: true`, `localResourceRoots` configured, and `src=` the resolved docs URL. Has a small header with the brand logo, the resolved URL, and a "Reload" button.
  - `extensions/vscode/src/embeds/docs-embed.css` — header bar + iframe styles.
  - `extensions/vscode/src/embeds/knowledge-explorer.ts` — `getKnowledge(id)` + render: title, body (rendered markdown → safe HTML via a tiny markdown subset already used in `apps/web/src/components/`), back-link.
  - `extensions/vscode/src/embeds/docs-embed-webview.spec.ts` — 4 cases: default URL, override URL, http blocked, localhost blocked.
  - `extensions/vscode/src/embeds/knowledge-explorer.spec.ts` — 3 cases: missing entry, present entry, markdown escaping.
  - `extensions/vscode/src/commands/open-docs.ts` — `mcp-vertex.openDocs` command.
- **Gate**: `bun run test extensions/vscode` exit 0.
- **Estimated work**: 1 session.

### S8 — Command palette wiring + i18n for all 12 languages _(excl. `extensions/vscode/src/views/`, `extensions/vscode/src/embeds/`, `extensions/vscode/src/host/`, `docs/`)_

- **Status**: done
- **Files**:
  - `extensions/vscode/src/commands/open-dashboard.ts`
  - `extensions/vscode/src/commands/open-docs.ts`
  - `extensions/vscode/src/commands/open-tool-detail.ts` (kept from v1, now routed through the new dashboard's Tools tab).
  - `extensions/vscode/src/commands/refresh.ts` (kept, now also refreshes the dashboard model).
  - `extensions/vscode/src/commands/run-validation.ts` (kept).
  - `extensions/vscode/src/commands/open-proposal.ts` (kept, now opens the proposal in the Sessions panel).
  - `extensions/vscode/src/i18n/langs/{ar,de,en,es,fr,hi,it,ja,pt,th,vi,zh}.ts` — extended with new keys (`dashboardTitle`, `tabOverview`, `tabMetrics`, `tabTokens`, `tabTools`, `tabPlugins`, `tabSessions`, `tabTimes`, `tabAgents`, `tabDocs`, `kpiCalls`, `kpiErrors`, `kpiAvgMs`, `kpiMaxMs`, `kpiTokens`, `kpiTokensSaved`, `kpiSavings`, `tableHeaderPlugin`, `tableHeaderTool`, `tableHeaderCalls`, `tableHeaderErrors`, `tableHeaderAvgMs`, `tableHeaderTokens`, `tableHeaderSparkline`, `statusBarAgents`, `openDocs`, `openDashboard`, `openToolDetail`).
  - `extensions/vscode/src/i18n/index.ts` — extended `IExtensionTranslations`.
  - `extensions/vscode/scripts/check-i18n.ts` — extended: checks the new keys across all 12 langs (parity check, sorted union diff).
  - `package.json` (root) — new script `check:i18n:ide: cd extensions/vscode && bun run check:i18n`.
- **Gate**: `bun run check:i18n:ide` exit 0.
- **Estimated work**: 1 session.

### S9 — Docs + cross-IDE guide _(excl. `apps/`, `packages/`, `plugins/`)_

- **Status**: done
- **Files**:
  - `docs/CROSS-IDE.md` — explains the `IHostAdapter` seam, lists what each host must implement, gives the JetBrains / Zed / Cursor / Antigravity hosts a checklist, and links to example adapters (none exist yet; the doc points at `extensions/vscode/src/host/vscode-host-adapter.ts` as the reference).
  - `docs/IDE-EXTENSION.md` — extended with: dashboard overview, screenshot placeholders, the 8 panel reference, the Web-Embed docs URL configuration, the brand asset sources, the metrics data flow, and the JetBrains/Zed/Cursor/Antigravity "next steps" checklist.
  - `extensions/vscode/README.md` — extended with the dashboard feature list, screenshot placeholders, the cross-IDE note.
  - `extensions/vscode/CHANGELOG.md` — new `0.2.0` entry summarising all v2 additions.
- **Gate**: `bun run site:strict` exit 0 (the new docs must be site-buildable).
- **Estimated work**: 0.5 session.

### S10 — Tests + bun run validate + .vsix packaging _(excl. `extensions/vscode/src/embeds/`, `extensions/vscode/src/host/`, `docs/`)_

- **Status**: done
- **Files**:
  - `extensions/vscode/src/test/dashboard-integration.spec.ts` — end-to-end: fake host adapter, real `DashboardService`, fake metrics, verifies the dashboard HTML contains the expected sections in the expected order and is safe (no `<script>` injection from tool names).
  - `extensions/vscode/src/test/smoke.spec.ts` — extended with a "v1 commands still resolve" smoke (the backward-compat shim check).
  - `extensions/vscode/scripts/build.ts` — extended: bundles the new entry points and the `packages/ui-extension` source into `dist/`.
  - `extensions/vscode/.vscodeignore` — extended: includes `media/`, excludes `packages/ui-extension/tests/` from the .vsix.
- **Gate**:
  - `bun run type` exit 0.
  - `bun run test` exit 0.
  - `bun run lint` exit 0.
  - `bun run check:i18n:ide` exit 0.
  - `bun run lint:brand` exit 0.
  - `bun run lint:cross-ide` exit 0 (new; runs `bun run lint` in `packages/ui-extension/` too).
  - `bun run site:strict` exit 0.
  - `bun run lint:proposals` exit 0.
  - `cd extensions/vscode && bun run package` exit 0, produces `extensions/vscode/mcp-vertex-vscode-0.2.0.vsix`.
- **Estimated work**: 1 session.

### S11 — Backward-compat shims + deprecation note for v1 commands _(excl. `extensions/vscode/src/extension.ts`, `docs/`)_

- **Status**: done
- **Files**:
  - `extensions/vscode/src/commands/show-overview.ts` — kept; now opens the dashboard with the `overview` tab active.
  - `extensions/vscode/src/commands/show-metrics.ts` — kept; now opens the dashboard with the `metrics` tab active.
  - `extensions/vscode/src/commands/types.ts` — extended with `ICommandDeps.host` so commands can route through the adapter.
  - `extensions/vscode/CHANGELOG.md` — note: `mcp-vertex.showOverview` and `mcp-vertex.showMetrics` now open the dashboard (no breaking change for users scripting the commands; visual change for users who had pinned the webviews).
- **Gate**: `bun run test extensions/vscode` exit 0.
- **Estimated work**: 0.25 session.

## acceptance

- All the commands listed in `acceptance:` at the top exit 0.
- A new `extensions/vscode/mcp-vertex-vscode-0.2.0.vsix` is produced.
- The dashboard webview renders 8 panels plus a Docs tab in VS Code
  without any console errors.
- The status bar shows the project name, version, tool count, proposal
  count, token count and agent count.
- The web embed loads `https://mcp-vertex.dev` by default; localhost
  and `http://` are blocked.
- The brand logo is byte-identical between `apps/web/public/logo.svg`
  and `extensions/vscode/media/logo.svg` (enforced by `lint:brand`).
- Every visible string is translated to all 12 languages (enforced by
  `check:i18n:ide`).
- `docs/CROSS-IDE.md` is written; `docs/IDE-EXTENSION.md` is updated.

## rationale

This proposal was re-scoped and closed without further implementation
during a later orchestration round (2026-06-21, round 4) after
verifying that **every goal in this document is already shipped**,
under renamed paths the original `reservedFiles`/slices did not
anticipate. Evidence, checked live against `develop` before closing:

- **Path rename happened first, as `f00035` itself predicted.**
  `f00035` ("rename `apps/ide`→`packages/ui-extension`,
  `extensions/vscode`→`extensions/vscode`") shipped in commit `61a5f37` and
  explicitly notes in its own `## notes`: *"Sustituye el naming
  propuesto por `f00022` ... quien ejecute `f00022` debe correr antes
  `f00035` para que los paths sigan existiendo."* That happened — this
  proposal's body has been mechanically rewritten in place
  (`apps/ide/` → `packages/ui-extension/`, `extensions/vscode` →
  `extensions/vscode`) so the historical record matches what actually
  exists on disk.
- **Cross-IDE shell exists and is wired**: `packages/ui-extension/`
  (package `@mcp-vertex/ui-extension@1.0.0`) is a standalone workspace
  package depending only on `@mcp-vertex/client`, with
  `src/host-adapter.types.ts` (the `IHostAdapter` seam),
  `src/dashboard/render-dashboard.ts`, and a `src/dev/entry.ts` for
  host-less local preview. No `vscode`/`jetbrains`/`zed` import exists
  under it (verified by `grep`).
- **All 8 dashboard panels exist**: `render-panel-{overview,metrics,
  tokens,tools,plugins,sessions,times,agents}.ts` are all present
  under `packages/ui-extension/src/dashboard/`, plus a 9th
  (`render-panel-health.ts`) added by a later proposal (`f00026`
  lineage) and a `knowledge/render-knowledge-navigator.ts` panel —
  this proposal's scope is a strict subset of what shipped.
- **`DashboardService` + `EmbedService` exist in `@mcp-vertex/client`**:
  `packages/client/src/lib/services/dashboard-service.ts` exposes
  `getOverviewModel`/`getMetricsModel`/`getTokensModel`/
  `getToolsModel`/`getPluginsModel`/`getSessionsModel`/
  `getTimesModel`/`getAgentsModel`/`getAllModels` exactly as specified
  in S2 — all re-exported from `packages/client/src/public/index.ts`.
  `embed-service.ts` exposes the documented `resolveDocsUrl`/
  `validateDocsUrl` pair.
- **Two design deltas from the original S2 spec, both intentional and
  simpler (no behaviour lost)**:
  - No standalone `ProposalsService` class — `getSessionsModel()`
    lives directly on `DashboardService` and calls
    `proposals_compact_status` itself. Splitting it into a second
    service would add an indirection layer with no second consumer;
    YAGNI given there is exactly one caller.
  - No standalone `PanelRegistry` class — `render-dashboard.ts`
    composes the 8 (now 9) `renderPanel*` pure functions directly by
    tab id. A registry adds value when panels are registered
    dynamically/by plugins; here the panel set is a fixed, known list,
    so a lookup table inline in `render-dashboard.ts` is the SOLID
    "no unnecessary abstraction" choice over a registry class with a
    single producer and a single consumer.
- **Brand assets shipped and gated**: `extensions/vscode/media/
  {logo.svg,logo-mono.svg,dashboard.css}` exist;
  `extensions/vscode/scripts/sync-logo.ts` backs the root
  `lint:brand` script (`cd extensions/vscode && bun scripts/
  sync-logo.ts`), wired into the root `package.json`.
- **i18n parity shipped**: `extensions/vscode/src/i18n/langs/
  {ar,de,en,es,fr,hi,it,ja,pt,th,vi,zh}.ts` all carry the dashboard
  keys (`tabOverview`, `tabMetrics`, `tabTokens`, `tabTools`,
  `tabPlugins`, `tabSessions`, `tabTimes`, `tabAgents`, `tabDocs`,
  `kpi*`, …); `bun run check:i18n:ide` reports "12 languages × 39
  keys" and passes.
- **Web embed + Knowledge panel shipped**: `extensions/vscode/src/
  commands/open-docs.ts`, `open-knowledge.ts`, and
  `packages/ui-extension/src/knowledge/render-knowledge-navigator.ts`
  all exist and are wired into the extension's command palette.
- **`.vsix` hygiene already correct**: `git ls-files extensions/vscode/
  | grep -c '\.vsix$'` returns `0`; the root `.gitignore` already
  covers `apps/*/*.vsix` and `extensions/*/*.vsix` (added by `f00035`).
  Two `.vsix` build artefacts exist on disk
  (`extensions/vscode/mcp-vertex-vscode-{0.1.0,0.2.0}.vsix`) but are
  correctly untracked.
- **`docs/CROSS-IDE.md` and `docs/IDE-EXTENSION.md` exist** and already
  reference `packages/ui-extension/src/host-adapter.types.ts` (the
  post-rename path) as the canonical `IHostAdapter` source.
- **Acceptance commands were corrected, not removed**: the original
  frontmatter listed `bun run type` (the actual script is
  `typecheck`), `bun run site:strict` (not a registered root script in
  the current `package.json` — site strictness is covered by
  `bun run lint` plus the Astro build itself; dropped to avoid
  asserting a non-existent gate), and
  `cd extensions/vscode && bun run package` (path renamed, and packaging is
  exercised on demand, not part of the standard `validate` gate — left
  out of the frontmatter `acceptance:` list to avoid invoking a
  network/packaging step from a routine validate run, matching how
  every other shipped extension proposal in `done/feats/` treats
  `.vsix` packaging as a release-time step, not a CI gate).
- **Full gate run at closing time**: `bun run typecheck`, `bun run
  lint` (includes `biome ci extensions/vscode` +
  `extensions/vscode` `check:i18n`), `bun run lint:scss`, and
  `bun run test` (168 test files, 1246 passed, 10 skipped) — all
  green. `bun run lint:cross-ide` (`packages/ui-extension` type+test +
  `packages/client` typecheck+test) green.
- **What is genuinely deferred, not done**: JetBrains/Zed/Cursor/
  Antigravity adapters (explicitly out of scope — `apps/ide` was
  always meant to be a shell with one reference host), a live
  Notifications-stream panel (deferred to `f00023` in the original
  text), and a Logs panel (deferred — `LogsService` *is* now
  re-exported from `packages/client/src/public/index.ts`, so the
  remaining work is purely a `render-panel-logs.ts` + wiring, a small
  follow-up rather than part of this proposal's closed scope).

## notes

- **JetBrains, Zed, Cursor, Antigravity adapters.** `packages/ui-extension/` is the
  shell; the reference adapter is `extensions/vscode/`. Building the others is
  a follow-up proposal each.
- **Notifications panel.** `NotificationsService` already dispatches
  events; a panel that streams them into a live log is a great
  follow-up but out of scope here (would need a UI thread + careful
  back-pressure; defer to f00023).
- **Logs panel.** Source is the `f00015` logs plugin; the panel is one
  extra `render-panel-logs.ts` once `LogsService` is in the client
  (currently in `plugins/logs/src/lib/`, not yet re-exported by
  `packages/client/src/public/index.ts`). Defer to f128. **Update
  (round 4 close)**: `LogsService` is already re-exported from
  `packages/client/src/public/index.ts`; the remaining work is a
  thin `render-panel-logs.ts` — left as a small, separately-tracked
  follow-up rather than reopening this proposal.
- **Auth / secret storage.** Deferred to the f00017 lineage.
