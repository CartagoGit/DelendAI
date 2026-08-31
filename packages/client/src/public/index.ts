export {
	McpStdioClient,
	McpToolError,
	logHintFromResult,
	payloadFromResult,
} from '../lib/transport/mcp-stdio-client';
export type {
	IMcpLogHint,
	IMcpStdioClientOptions,
	IMcpToolCallResult,
	IMcpToolDescriptor,
	IMcpTransport,
} from '../lib/contracts/interfaces/mcp-transport.interface';
export type {
	IMcpTransportError,
	McpTransportErrorCode,
	McpTransportErrorKind,
} from '../lib/contracts/interfaces/mcp-transport-error.interface';
export {
	DEFAULT_NAMESPACE_PREFIX,
	formatToolName,
	parsePrefix,
} from '../lib/services/_namespace';
export type { INamespacePrefix } from '../lib/services/_namespace';
export {
	OverviewService,
	normalizeTool,
	normalizeCompactTools,
	pluginFromToolName,
} from '../lib/services/overview.service';
export type { IOverviewOptions } from '../lib/services/overview.service';
export {
	KnowledgeNotFoundError,
	KnowledgeService,
	categoryOf,
} from '../lib/services/knowledge.service';
export { MetricsService } from '../lib/services/metrics.service';
export { NotificationsService } from '../lib/services/notifications.service';
export { LogsService } from '../lib/services/logs.service';
export { NotificationLogsBridge } from '../lib/services/notification-logs-bridge';
export { SearchService } from '../lib/services/search.service';
export { AgentCatalogService } from '../lib/services/agent-catalog-service';
export {
	readConfigurationDocument,
	saveConfigurationDocument,
} from '../lib/services/configuration-center.service';
export { MemoryService } from '../lib/services/memory.service';
export {
	DEFAULT_EXTENSION_SETTINGS,
	SettingsService,
	validateExtensionSettings,
} from '../lib/services/settings.service';
export {
	EXTENSION_SETTINGS_STORAGE_KEY,
	EXTENSION_SETTINGS_STORAGE_VERSION,
} from '../lib/contracts/constants/settings.constant';
export {
	HOST_LANGUAGE_CHOICES,
	HOST_LOG_LEVELS,
	HOST_MOTION_CHOICES,
	HOST_THEME_CHOICES,
} from '../lib/contracts/interfaces/settings.interface';
export type {
	ILogCorrelateResult,
	ILogEvent,
	ILogOutcome,
	ILogQueryFilter,
	ILogQueryResult,
	ILogRedactionTestResult,
	ILogSubscribeOptions,
	ILogTailResult,
	INotificationLogEntry,
} from '../lib/contracts/interfaces/logs.interface';
export type { INotificationLogsBridgeOptions } from '../lib/services/notification-logs-bridge';
export type {
	IKnowledgeFullEntry,
	IKnowledgeListEntry,
} from '../lib/services/knowledge.service';
export type {
	IKnowledgeHit,
	ISearchHit,
	ISearchOptions,
	ISearchResult,
	IToolHit,
} from '../lib/contracts/interfaces/search.interface';
export type {
	IAgentCatalogSearchResult,
	IAgentCatalogServiceOptions,
} from '../lib/services/agent-catalog-service';
export type {
	ConfigurationEdit,
	ConfigurationPathSegment,
	IConfigurationDocumentInput,
	IConfigurationDocumentSnapshot,
	IConfigurationValidationIssue,
	ISaveConfigurationDocumentInput,
	SaveConfigurationDocumentResult,
} from '../lib/contracts/interfaces/configuration-edit.interface';
export type {
	IMemoryEntry,
	IMemoryForgetResult,
	IMemoryListEntry,
	IMemoryListOptions,
	IMemoryListResult,
	IMemoryRecallOptions,
	IMemorySaveInput,
	IMemorySaveResult,
} from '../lib/contracts/interfaces/memory.interface';
export type {
	IExtensionSettings,
	IExtensionSettingsPatch,
	IHostPreferences,
	ISettingsStore,
	IStoredExtensionSettings,
	ISettingsValidationResult,
	HostLanguage,
	HostLogLevel,
	HostMotion,
	HostTheme,
} from '../lib/contracts/interfaces/settings.interface';
export {
	DashboardService,
	createEmptyTotals,
} from '../lib/services/dashboard.service';
export { HealthService } from '../lib/services/health.service';
export type {
	IHealthOptions,
	IHealthSnapshot,
	IStaleAgent,
	IStaleKind,
} from '../lib/contracts/interfaces/health.interface';
export { ConnectionHealthService } from '../lib/services/connection-health.service';
export type {
	IConnectionHealthEvent,
	IConnectionHealthOptions,
	IConnectionHealthSnapshot,
	IConnectionState,
} from '../lib/contracts/interfaces/connection-health.interface';
export type { IDashboardServiceOptions } from '../lib/services/dashboard.service';
export type {
	IDashboardAgentsModel,
	IDashboardAllModels,
	IDashboardDataState,
	IDashboardMemoryModel,
	IDashboardMetricsModel,
	IDashboardOverviewModel,
	IDashboardPluginsModel,
	IDashboardSessionsModel,
	IDashboardSourceAgents,
	IDashboardSourceOverview,
	IDashboardSourceProposals,
	IDashboardSpendModel,
	IDashboardTimesModel,
	IDashboardTokensModel,
	IDashboardToolsModel,
	IDashboardTotals,
	IToolMetricRow,
} from '../lib/contracts/interfaces/dashboard.interface';
export {
	DEFAULT_DOCS_URL,
	EmbedService,
	resolveDocsUrl,
	validateDocsUrl,
} from '../lib/services/embed.service';
export type {
	IDocsUrlConfig,
	IDocsUrlValidation,
	IEmbedServiceOptions,
	IResolvedDocsUrl,
} from '../lib/services/embed.service';
export type {
	IMetricsSnapshot,
	IMetricsSnapshotOptions,
	IMetricsStreamOptions,
} from '../lib/services/metrics.service';
export type {
	IAwaitLockOptions,
	IAwaitLockResult,
	IBloqueadoNotificationEvent,
	ICapNotificationEvent,
	ILockReleasedEvent,
	INotificationEvent,
	INotificationEventName,
	INotificationListener,
	INotificationStatus,
	IStatusNotificationEvent,
} from '../lib/services/notifications.service';
export type {
	IKnowledgeEntry,
	IKnowledgeSummary,
	IOverview,
	IOverviewKnowledge,
	IOverviewTool,
	IToolDescriptor,
	IToolEffect,
} from '../lib/contracts/interfaces/tool-descriptor.interface';

// r00030 (Track C): the client only re-exports TYPES from
// `@mcp-vertex/core/contracts`, not runtime values from
// `@mcp-vertex/core/public`. This keeps the client decoupled
// from the runtime surface (which carries Node-only helpers).
// Consumers that need runtime values should import from
// `@mcp-vertex/core/public` directly.
export type * from '@mcp-vertex/core/contracts';

// --- scaffolding helpers (f00087 S2) ----------------------------------------
// f00087 S2: re-export the pure scaffold generators from the core
// plus the client-side writer helper. A consumer that wants to
// scaffold a plugin/tool/skill outside an MCP session can call these
// directly without spinning up a host.
export {
	writeScaffoldedFiles,
	writeScaffoldedFilesOrThrow,
} from '../lib/scaffold/write-scaffolded-files';
export type {
	IWriteScaffoldedFilesOptions,
	IWriteScaffoldedFilesResult,
} from '../lib/scaffold/write-scaffolded-files';

// --- project plugin scaffolding (f00089 U4) ---------------------------------
// f00089 U4: one client-callable action that creates a complete, correct
// `IMcpPlugin` from a declarative spec AND registers it on the host by PATH
// (`plugins.<name>.path` in mcp-vertex.config.json). The target project's
// LLM calls this to add project-specific plugins without ever reading the
// mcp-vertex core or its internal plugins. Reuses the f00087 scaffold +
// writer machinery.
export {
	createProjectPlugin,
	repairProjectPlugin,
} from '../lib/scaffold/project-plugins';
export { setPluginActivation } from '../lib/services/plugin-activation.service';
export type {
	ISetPluginActivationInput,
	ISetPluginActivationResult,
} from '../lib/contracts/interfaces/plugin-activation.interface';
export type {
	IProjectPluginOptions,
	IProjectPluginRegistration,
	IProjectPluginResult,
	IProjectPluginSpec,
	IPluginFieldSpec,
	IPluginFieldType,
	IPluginToolSpec,
	IRepairProjectPluginResult,
} from '../lib/scaffold/project-plugins';

// --- f00193 (Track K / external MCPs): control-plane registry + router ----
// ships the registry + router that lets the host talk to multiple
// external MCP providers and pick the best one per capability. Re-exports
// the pure types and helpers; runtime values (the `ExternalMcpRegistry`
// class) are exposed alongside.
export {
	ExternalMcpRegistry,
	formatRegistrySnapshot,
	sanitizeProbeReason,
	scoreAll,
} from '../services/external-mcp/registry';
export type {
	IRegistryOptions,
	IRegisteredProviderSnapshot,
} from '../services/external-mcp/registry';
export {
	classifyHealth,
	DEFAULT_DEGRADED_LATENCY_MS,
	DEFAULT_DOWN_LATENCY_MS,
	probeProvider,
	worstOf,
} from '../services/external-mcp/health';
export type { IClassifyHealthOptions } from '../services/external-mcp/health';
export {
	redactProviderId,
	scoreProvider,
	selectProvider,
	selectWithFailover,
} from '../services/external-mcp/router';
export type {
	IRouterInput,
	IRouterInputEnvelope,
} from '../services/external-mcp/router';
export { DEFAULT_ROUTER_WEIGHTS } from '../services/external-mcp/types';
export type {
	ExternalMcpTransport,
	ExternalMcpCapability,
	IExternalMcpConnection,
	IExternalMcpCost,
	IExternalMcpHealth,
	IExternalMcpProvider,
	IExternalMcpRefusal,
	IExternalMcpRouterOptions,
	IExternalMcpSelection,
	ProviderHealthState,
	RedactedProviderId,
} from '../services/external-mcp/types';
