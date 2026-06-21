# Cross-IDE guide — building a new `@mcp-vertex/<ide>` host

The VS Code extension is the **reference implementation** of an
`@mcp-vertex` IDE host. Every other IDE (JetBrains, Zed, Cursor,
Antigravity) ships **the same dashboard, panels and commands** by
implementing one ~200-line adapter against the `IHostAdapter`
interface declared in [`apps/ide/src/host-adapter.types.ts`](../apps/ide/src/host-adapter.types.ts).

The `packages/core` and every plugin remain **host-agnostic** — no IDE
imports leak into the server. Only the IDE host knows about its own
runtime (e.g. `com.intellij.openapi.*`, `zed_extension_api`,
`vscode.*`).

## What you get for free

Implement `IHostAdapter` once and you automatically get:

- **8 dashboard panels** (Overview, Metrics, Tokens, Tools, Plugins,
  Sessions, Times, Agents) — pure HTML/CSS/vanilla JS, no React/Vue.
- **Brand identity** — same logo, palette, KPI strip, header.
- **Knowledge explorer** — via `KnowledgeService` (in
  `packages/client`).
- **Web-embed docs** — the dashboard's Docs tab loads the configured
  `extension.docsUrl` with localhost + private-IP rejection out of the
  box.
- **Status bar upgrade** — `${tools} tools • ${proposals} proposals •
  ${tok} • ${agents} agents` and click → open dashboard.
- **Notifications** — `lock-released`, `cap`, `bloqueado` events from
  the server flow into your status bar / dashboard refresh.
- **i18n** — 12 languages (ar, de, en, es, fr, hi, it, ja, pt, th, vi,
  zh) parity-checked by `bun run check:i18n:ide`.

## The interface (12 methods)

```ts
export interface IHostAdapter {
  readonly id: string;            // e.g. 'jetbrains'
  readonly displayName: string;   // e.g. 'IntelliJ IDEA'
  readonly hostVersion: string;

  registerCommand(commandId: string, cb: (...args) => unknown): IDisposable;
  createStatusBarItem(alignment?, priority?): IStatusBarItem;

  registerTreeDataProvider(viewId: string, provider: ITreeDataProvider): IDisposable;
  createWebviewPanel(viewType: string, title: string, viewColumn: number, opts: IWebviewOptions): IWebviewPanel;
  registerWebviewViewProvider?(viewId: string, provider: IWebviewViewProvider): IDisposable;

  showInformationMessage(message: string): Promise<string | undefined>;
  showErrorMessage(message: string): Promise<string | undefined>;
  showQuickPick?(items: readonly IQuickPickItem[]): Promise<string | undefined>;

  openTextDocument(uri: string): Promise<unknown>;
  revealInExplorer(uri: string): Promise<void>;

  onDidChangeConfiguration(cb: (e) => void): IDisposable;
  getConfiguration<T>(section: string): T;

  asWebviewUri(relativePath: string): string;
}
```

`apps/vscode/src/host/vscode-host-adapter.ts` is the canonical reference
(~200 LoC, fully commented).

## How to build a host in 5 steps

1. **Create the workspace**: `apps/<ide>/package.json` depending on
   `@mcp-vertex/ide` and `@mcp-vertex/client`. Mirror
   `apps/vscode/package.json` shape.
2. **Implement `IHostAdapter`**: `apps/<ide>/src/host-adapter.ts`.
   Map every method onto the host's native API. For methods the host
   doesn't support (e.g. `showQuickPick` on Zed), return a typed
   no-op (the dashboard degrades gracefully).
3. **Activate**: on host startup, call
   `DashboardService.getAllModels()` + `renderDashboard(...)` and
   push the resulting HTML to a webview.
4. **Wire commands**: register `mcp-vertex.openDashboard`,
   `mcp-vertex.openDocs`, `mcp-vertex.refresh` against the host's
   command palette.
5. **i18n**: copy the 12 `langs/*.ts` files from `apps/vscode/src/i18n/`
   and wire `bun run check:i18n:ide` into CI.

## Per-host checklist

### JetBrains

- Webview: [`com.intellij.ui.jcef.JBCefBrowser`](https://plugins.jetbrains.com/docs/intellij/jcef.html).
- Status bar: `WindowManager.getInstance().getStatusBar(project)`.
- Commands: register an action in `plugin.xml` + bind it via
  `AnActionEvent`.
- Tree views: `TreeView` + `TreeStructureProvider`.
- i18n: use `com.intellij.DynamicBundle` (optional — fall back to
  `apps/vscode/src/i18n/langs/`).

### Zed

- Webview: [`zed_extension_api::View` with HTML content](https://zed.dev/docs/extensions/webviews).
- Status bar: `set_status_bar_text` (single text — Zed doesn't have
  multi-segment status bar; flatten to a single string).
- Commands: `register_command` + `CommandBinding`.
- Tree views: `register_panel` with a custom list view.

### Cursor

- Cursor uses the **same VS Code extension API** — the existing
  `VscodeHostAdapter` should work as-is. Just publish under the
  `cursor.` namespace and verify in the Cursor extension store.

### Antigravity

- Antigravity is built on VS Code; the existing
  `VscodeHostAdapter` works. Test with `cursor` + `antigravity`
  runtime when both become available.

## Verifying your adapter

Every method on `IHostAdapter` is exercised by the
`FakeHostAdapter` spec in
`apps/ide/tests/host-adapter.types.spec.ts`. To verify your
adapter, write a similar spec that:

1. Constructs the adapter with a stubbed host runtime.
2. Calls every method.
3. Asserts the returned values match the `IHostAdapter` types.
4. Cleans up via `dispose()` and confirms no leaked listeners.

Run `bun run lint:cross-ide` (the existing root script) to verify
typecheck + tests across `apps/ide`, `packages/client`, and your new
host.

## Versioning

When you change the `IHostAdapter` interface, bump
`@mcp-vertex/ide` and release a new minor. Existing hosts continue to
work via the `?` suffix on optional methods; missing methods are
detected at type-check time.

## Observability v3 (f126)

The VS Code extension now ships **six more client services** that
compose into the existing dashboard + add three new commands.
Because every new service is implemented in `apps/ide/` or
`packages/client/`, every host (JetBrains, Zed, Cursor, Antigravity)
gets them for free by reusing the same `IHostAdapter` they already
implement.

### New services

| Service | File | What it does |
|---|---|---|
| `LogsService` | [`packages/client/src/lib/services/logs-service.ts`](../packages/client/src/lib/services/logs-service.ts) | `query` / `tail` / `correlate` / `redactTest` against the server's `logs_*` tools. `subscribe(opts)` is an `AsyncIterable` that polls `logs_subscribe` with dedup + abort + max-events. |
| `NotificationLogsBridge` | [`packages/client/src/lib/services/notification-logs-bridge.ts`](../packages/client/src/lib/services/notification-logs-bridge.ts) | Subscribes to `lock-released` / `cap` / `bloqueado` events from `NotificationsService` and pairs each with the tool calls that fired within ±5s (using `MetricsService` as the source of truth). |
| `SearchService` | [`packages/client/src/lib/services/search-service.ts`](../packages/client/src/lib/services/search-service.ts) | `search(query, opts)` against `search_search`. `searchTools(query, tools)` and `searchKnowledge(query, entries)` are **client-side** fuzzy-substring matchers (exact=100, prefix=60, substring=40, tag=20, description=10) — no round-trip. |
| `HealthService` | [`packages/client/src/lib/services/health-service.ts`](../packages/client/src/lib/services/health-service.ts) | Aggregates `proposals_state_health`, `proposals_proposal_stale_list` and `proposals_agent_names` into a single `IHealthSnapshot`. Degrades gracefully on missing tools. |
| `ConnectionHealthService` | [`packages/client/src/lib/services/connection-health-service.ts`](../packages/client/src/lib/services/connection-health-service.ts) | Pings `status-marker_ping` every 5s, emits `up` / `down` / `retrying` events via an EventTarget-style API. Used by the VS Code status bar. |

### New commands

- `mcp-vertex.openKnowledge` — opens the **Knowledge Navigator**
  webview (category-grouped list + in-place search + body preview).
- `mcp-vertex.toolSearch` — opens a QuickPick over the live tool
  registry + knowledge entries (from `SearchService`).
- `mcp-vertex.restartServer` — re-spawns the MCP server. Hosts
  override the default behavior by passing a custom `restartFn`.

### New webview

`renderKnowledgeNavigator` in
[`apps/ide/src/knowledge/render-knowledge-navigator.ts`](../apps/ide/src/knowledge/render-knowledge-navigator.ts)
is a 2-pane HTML view: left = category-grouped list with a search
box, right = body preview. Pure function, no host imports — works
identically in every IDE.

### New dashboard panel

The 8-tab `renderDashboard` got a 9th tab (`Health`), driven by
`renderPanelHealth` in
[`apps/ide/src/dashboard/render-panel-health.ts`](../apps/ide/src/dashboard/render-panel-health.ts).
Shows a `Healthy` / `Degraded` KPI tile, the locks count, the stale
agents count, the queue (length / queued / waiter-orphans /
oldest-age / threshold), and the active agents list.

### Adopting f126 in your host

Nothing to do — the services are wired into the dashboard and the
new commands automatically if you implement the same
`registerCommand` / `createWebviewPanel` / `createStatusBarItem`
methods on your `IHostAdapter` (which you already do). The
status-bar `mcp-vertex.restartServer` falls back to an info message
when no custom `restartFn` is provided; JetBrains hosts can plug in
their own restart flow.
