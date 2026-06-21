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
