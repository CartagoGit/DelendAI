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
} from '../host-adapter.types';

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
export { barChart } from '../dashboard/bar-chart';
export type { IBarDatum } from '../dashboard/bar-chart';
export { sparklinePath } from '../dashboard/sparkline';
export {
	escapeHtml,
	formatBytes,
	formatMs,
	formatNumber,
	formatPercent,
	formatRelativeTime,
	formatTokens,
} from '../dashboard/format';
export { renderKnowledgeNavigator } from '../knowledge/render-knowledge-navigator';
export type { IRenderKnowledgeNavigatorOptions } from '../knowledge/render-knowledge-navigator';
