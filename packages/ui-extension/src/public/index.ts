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

export {
	ORCHESTRATOR_RUNNER_OPT_IN_SNIPPET,
	USAGE_TRACKING_OPT_IN_SNIPPET,
} from '../contracts/constants/opt-in-snippets.constant';
export { buildProviderStatusModel } from '../dashboard/builders/provider-status.builder';
export { buildPluginSwitchboardModel } from '../dashboard/builders/plugin-switchboard.builder';
export type {
	IPluginActivationOverviewPayload,
	IPluginActivationPayloadEntry,
	IPluginSwitchboardGroup,
	IPluginSwitchboardModel,
	IPluginSwitchboardReadyModel,
	IPluginSwitchboardRow,
	IPluginSwitchboardUnavailableModel,
	PluginSwitchboardBadge,
	PluginSwitchboardOrigin,
	PluginSwitchboardSource,
} from '../contracts/interfaces/plugin-switchboard.interface';
export type {
	IGetQuotaPayload,
	IHealthcheckProvidersPayload,
	IProviderHealthRowPayload,
	IProviderInstallHintPayload,
	IProviderQuotaMeter,
	IProviderStatusAbsentModel,
	IProviderStatusModel,
	IProviderStatusReadyModel,
	IProviderStatusRow,
	IQuotaWindowPayload,
	ProviderState,
	QuotaWindowName,
} from '../contracts/interfaces/provider-status.interface';
export { buildUsageCostModel } from '../dashboard/builders/usage-cost.builder';
export { buildModelAttributionModel } from '../dashboard/builders/model-attribution.builder';
export type {
	IModelAttributionAbsentModel,
	IModelAttributionBucketPayload,
	IModelAttributionModel,
	IModelAttributionReadyModel,
	IModelAttributionReportPayload,
	IModelAttributionRow,
} from '../contracts/interfaces/model-attribution.interface';
export type {
	ILimitsStatusPayload,
	ISpendMeter,
	IUsageBucketPayload,
	IUsageCostAbsentModel,
	IUsageCostCardModel,
	IUsageCostReadyModel,
	IUsageCostRow,
	IUsageExpensiveCallPayload,
	IUsageReportPayload,
	IUsageTotalsPayload,
	UsageGroupByAxis,
} from '../contracts/interfaces/usage-cost.interface';
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
export {
	renderToolDetailBody,
	renderToolDetailHtml,
	DEFAULT_TOOL_DETAIL_COPY,
} from '../dashboard/render-tool-detail';
export type {
	IToolDetail,
	IToolDetailCopy,
} from '../contracts/interfaces/tool-detail.interface';
export type { IRenderableSchema } from '../contracts/interfaces/renderable-schema.interface';
export {
	renderProposalDetailBody,
	renderProposalDetailHtml,
	DEFAULT_PROPOSAL_DETAIL_COPY,
} from '../dashboard/render-proposal-detail';
export type {
	IProposalAgent,
	IProposalDetail,
	IProposalDetailCopy,
	IProposalLogEvent,
	IProposalProgress,
	IProposalSliceSummary,
	IProposalSummary,
} from '../contracts/interfaces/proposal-detail.interface';
export { barChart } from '../dashboard/bar-chart';
export type { IBarDatum } from '../dashboard/bar-chart';
export { sparklinePath } from '../dashboard/sparkline';
export { progressRing } from '../dashboard/progress-ring';
export {
	renderBrandIcon,
	renderFlagIcon,
	hasBrandIcon,
	hasFlagIcon,
	languageFlag,
	allBrandCodes,
	allFlagCodes,
	FLAG_NAMES,
} from '../dashboard/brand-icons';
export { renderPluginBadge } from '../dashboard/plugin-badge';
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
export { buildConfigurationCenterModel } from '../configuration-center/configuration-center-model';
export { buildConfigurationFields } from '../configuration-center/configuration-center-fields';
export { renderConfigurationCenter } from '../configuration-center/render-configuration-center';
export type {
	ConfigurationCenterState,
	ConfigurationCenterTab,
	ConfigurationFieldKind,
	IConfigurationArtifactModel,
	IConfigurationCenterCopy,
	IConfigurationCenterModel,
	IConfigurationCenterSource,
	IConfigurationCenterTabModel,
	IConfigurationField,
	IConfigurationPluginModel,
	IConfigurationProviderModel,
	IRenderConfigurationCenterOptions,
} from '../contracts/interfaces/configuration-center.interface';
export { renderSettings } from '../settings/render-settings';
export type { IRenderSettingsOptions } from '../settings/render-settings';
export type {
	SettingsHostResponse,
	SettingsWebviewRequest,
} from '../contracts/interfaces/settings-webview-message.interface';
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
