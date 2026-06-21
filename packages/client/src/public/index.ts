export {
	McpStdioClient,
	McpToolError,
	payloadFromResult,
} from '../lib/transport/mcp-stdio-client';
export type {
	IMcpStdioClientOptions,
	IMcpToolCallResult,
	IMcpToolDescriptor,
	IMcpTransport,
} from '../lib/transport/mcp-transport.types';
export {
	OverviewService,
	normalizeTool,
	pluginFromToolName,
} from '../lib/services/overview-service';
export type { IOverviewOptions } from '../lib/services/overview-service';
export {
	KnowledgeNotFoundError,
	KnowledgeService,
} from '../lib/services/knowledge-service';
export { MetricsService } from '../lib/services/metrics-service';
export { NotificationsService } from '../lib/services/notifications-service';
export { LogsService } from '../lib/services/logs-service';
export { NotificationLogsBridge } from '../lib/services/notification-logs-bridge';
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
} from '../lib/services/logs.types';
export type { INotificationLogsBridgeOptions } from '../lib/services/notification-logs-bridge';
export {
	DashboardService,
	createEmptyTotals,
} from '../lib/services/dashboard-service';
export type { IDashboardServiceOptions } from '../lib/services/dashboard-service';
export type {
	IDashboardAgentsModel,
	IDashboardAllModels,
	IDashboardMetricsModel,
	IDashboardOverviewModel,
	IDashboardPluginsModel,
	IDashboardSessionsModel,
	IDashboardSourceAgents,
	IDashboardSourceOverview,
	IDashboardSourceProposals,
	IDashboardTimesModel,
	IDashboardTokensModel,
	IDashboardToolsModel,
	IDashboardTotals,
	IToolMetricRow,
} from '../lib/services/dashboard.types';
export {
	DEFAULT_DOCS_URL,
	EmbedService,
	resolveDocsUrl,
	validateDocsUrl,
} from '../lib/services/embed-service';
export type {
	IDocsUrlConfig,
	IDocsUrlValidation,
	IEmbedServiceOptions,
	IResolvedDocsUrl,
} from '../lib/services/embed-service';
export type {
	IMetricsSnapshot,
	IMetricsSnapshotOptions,
	IMetricsStreamOptions,
} from '../lib/services/metrics-service';
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
} from '../lib/services/notifications-service';
export type {
	IKnowledgeEntry,
	IKnowledgeSummary,
	IOverview,
	IOverviewKnowledge,
	IOverviewTool,
	IToolDescriptor,
	IToolEffect,
} from '../lib/services/tool-descriptor.types';

export type * from '@mcp-vertex/core/public';
