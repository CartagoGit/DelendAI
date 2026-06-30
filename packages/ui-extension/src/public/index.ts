/**
 * Public surface of `apps/ide/`. Re-exports the `IHostAdapter` types
 * and the dashboard renderers so downstream hosts can
 * `import { renderDashboard } from '@mcp-vertex/ide/public'`.
 */
export type {
	ICommandCallback,
	IConfigurationChangeEvent,
	IDisposable,
	IHostAdapter,
	IHostAlignment,
	IQuickPickItem,
	IStatusBarItem,
	ITreeDataProvider,
	ITreeNode,
	IWebviewOptions,
	IWebviewPanel,
	IWebviewViewProvider,
} from '../contracts/interfaces/host-adapter.interface';

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
export {
	SHARED_UI_STRINGS,
	BRAND_TOKENS,
} from '../strings/shared-ui-strings';
export type { SharedUiStringKey } from '../strings/shared-ui-strings';
export { renderKnowledgeNavigator } from '../knowledge/render-knowledge-navigator';
export type { IRenderKnowledgeNavigatorOptions } from '../knowledge/render-knowledge-navigator';
export { renderSettings } from '../settings/render-settings';
export type { IRenderSettingsOptions } from '../settings/render-settings';
export {
	ExtensionSettingsSchema,
	LogLevelSchema,
	ThemeSchema,
} from '../settings/settings-schema';
export type { ExtensionSettings } from '../settings/settings-schema';
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
export {
	renderToolbar,
	defaultQuickActions,
	filterByHost,
	QUICK_ACTION_CATEGORIES,
} from '../toolbar';
export {
	DEFAULT_DENY,
	WEBVIEW_CSP_OVERRIDES,
	resolveCspPolicy,
	cspHeaderValue,
	injectCspMeta,
	withCsp,
} from '../webview/csp';
export type { IWebviewCspPolicy } from '../webview/csp';
export type {
	QuickAction,
	QuickActionCategory,
	IRenderToolbarOptions,
} from '../toolbar';
