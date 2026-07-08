/**
 * `packages/ui-extension/webview` — browser-safe webview surface.
 *
 * This sub-path exists so browser bundles (the `extensions/vscode`
 * dev entry on :5200, the `packages/ui-extension` dev entry on :5100,
 * and any future webview preview harness) can import the rich UI
 * surface without pulling in the whole `@mcp-vertex/client` barrel —
 * which transitively re-exports `McpStdioClient` →
 * `@modelcontextprotocol/sdk/client/stdio` → `cross-spawn` →
 * `require('child_process')`, and that Node builtin makes
 * `Bun.build({ target: 'browser' })` fail with a 500.
 *
 * What is included here:
 *  - The CSP helpers (`DEFAULT_DENY`, `injectCspMeta`, …) — pure data
 *    and DOM-injection, no client imports.
 *  - The dashboard renderer (`renderDashboard`) and its panel renderers,
 *    plus the shared formatters / components / language picker the
 *    dashboard transitively calls. Every module in this chain has only
 *    `import type` references to `@mcp-vertex/client`, so the bundled
 *    JS has zero client runtime code.
 *  - The shared UI strings constants the renderers read.
 *  - `mockDashboardModel` — the dashboard mock so dev entries can render
 *    against rich data without keeping their own copy. Production code
 *    (the host extension) never imports this; it only feeds real
 *    `IDashboardAllModels` snapshots from the MCP server.
 *
 * What is intentionally NOT here:
 *  - Anything that has a value import from `@mcp-vertex/client`
 *    (`settings-schema.ts` re-exports `DEFAULT_EXTENSION_SETTINGS`).
 *    Those stay in `@mcp-vertex/ui-extension/public` for the host
 *    (VS Code extension host, JetBrains plugin) where Node builtins
 *    are available.
 *  - Host-adapter types and contracts (`IHostAdapter`, `ITreeDataProvider`,
 *    etc.) — they live in `../contracts/interfaces` but are not
 *    re-exported from this sub-path on purpose, because they are only
 *    meaningful inside a host runtime.
 */
export {
	DEFAULT_DENY,
	WEBVIEW_CSP_OVERRIDES,
	resolveCspPolicy,
	cspHeaderValue,
	injectCspMeta,
	withCsp,
} from '../webview/csp';
export type { IWebviewCspPolicy } from '../webview/csp';

export { renderDashboard } from '../dashboard/render-dashboard';
export type { IRenderDashboardOptions } from '../dashboard/render-dashboard';
export { renderPanelAgents } from '../dashboard/render-panel-agents';
export { renderPanelMetrics } from '../dashboard/render-panel-metrics';
export { renderPanelOverview } from '../dashboard/render-panel-overview';
export { renderPanelPlugins } from '../dashboard/render-panel-plugins';
export { renderPanelSessions } from '../dashboard/render-panel-sessions';
export { renderPanelTimes } from '../dashboard/render-panel-times';
export { renderPanelTokens } from '../dashboard/render-panel-tokens';
export { renderPanelTools } from '../dashboard/render-panel-tools';
export { renderPanelHealth } from '../dashboard/render-panel-health';
export { renderPanelMemory } from '../dashboard/render-panel-memory';
export { barChart } from '../dashboard/bar-chart';
export type { IBarDatum } from '../dashboard/bar-chart';
export { sparklinePath } from '../dashboard/sparkline';
export {
	escapeHtml,
	formatBytes,
	formatDate,
	formatMs,
	formatNumber,
	formatPercent,
	formatRelativeTime,
	formatTime,
	formatTokens,
} from '../dashboard/format';
export { SHARED_UI_STRINGS, BRAND_TOKENS } from '../strings/shared-ui-strings';
export type { SharedUiStringKey } from '../strings/shared-ui-strings';

export { renderKnowledgeNavigator } from '../knowledge/render-knowledge-navigator';
export type { IRenderKnowledgeNavigatorOptions } from '../knowledge/render-knowledge-navigator';

export {
	renderHeaderBar,
	renderDropdown,
	renderDisclosure,
	renderLanguagePicker,
	readInitialLang,
	writeLang,
	renderToast,
	componentCss,
	componentScript,
	renderRuntime,
} from '../components';
export type {
	IHeaderBarOptions,
	IDropdownOptions,
	IDropdownItem,
	IDisclosureOptions,
	ILanguagePickerOptions,
	IToastOptions,
	ToastKind,
	IComponentRuntimeHost,
} from '../components';

/**
 * Dev-only: the dashboard mock used by both `:5100` (ide dev entry)
 * and `:5200` (vscode webviews preview) so the rich dashboard can be
 * rendered without a live MCP server. Not part of the public contract
 * for hosts — only dev entries that already opt into `@mcp-vertex/
 * ui-extension/webview` should import this.
 */
export { mockDashboardModel } from '../dev/mock-model';

/**
 * Dev-only: the CSS string for the setup wizard rendered by the
 * `:5200` entry when a workspace isn't wired up. Kept separate from
 * `dashboardCss` because the wizard shows up *before* the dashboard
 * chrome is on the page (the user sees the wizard, then clicks
 * Install, then the dashboard renders). Both ship in the same
 * browser bundle so the cost is one extra inline `<style>` block.
 */
export { devPreviewCss } from '@mcp-vertex/shared/styles/dev-preview-css';
