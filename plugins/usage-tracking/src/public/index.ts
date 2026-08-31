/**
 * Public surface of `@mcp-vertex/usage-tracking`. The default export (in
 * `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes the
 * record/rollup/pricing helpers + the tool builders for programmatic reuse.
 */
export { default } from '../index';

export { detectAgent, BUILTIN_CLIENT_TABLE } from '../lib/detect-agent';
export type { IClientMapping } from '../lib/detect-agent';
export { RecordBuffer } from '../lib/record-buffer';
export type { IRecordBufferOptions } from '../lib/record-buffer';
export { StartClock } from '../lib/start-clock';
export {
	analyzeSessionHygiene,
	DEFAULT_SESSION_HYGIENE_POLICY,
	SessionHygieneMonitor,
} from '../lib/session-hygiene';
export {
	mapHygieneToCheckpointAdvisory,
	SESSION_TOO_LONG_CODE,
	SessionTooLongAdvisorySource,
	sessionTooLongDedupeKey,
} from '../lib/services/checkpoint-advisory.service';
export {
	readHostLifecycleEvents,
	summarizeHostLifecycle,
} from '../lib/host-lifecycle';
export {
	attributeTool,
	deriveCorePrefix,
	CORE_PLUGIN_KEY,
} from '../lib/attribute';
export type { IToolAttribution } from '../lib/attribute';
export {
	buildRecord,
	extractModel,
	extractTokenAccounting,
	extractUsage,
	resolveSessionId,
} from '../lib/record';
export type { IBuildRecordInput } from '../lib/record';
export {
	bucketBy,
	buildSummary,
	computeTotals,
	readInvocations,
	readSummary,
	regenerateSummary,
	withinWindow,
	writeSummary,
} from '../lib/rollup';
export type { IBuildSummaryOptions } from '../lib/rollup';
export { extractAutoBypassed, countAutoBypassed } from '../lib/auto-bypass';
export type {
	IToolInvocationTelemetrySample,
	IToolInvocationTelemetrySummary,
} from '../lib/preferred-path-metrics';
export {
	computeLimitsStatus,
	emptyLimitsStatus,
	isBreakerActive,
	recordDegradation,
	startOfCalendarMonth,
	type ILimitsConfig,
} from '../lib/circuit-breaker';
export {
	computeCostUsd,
	fetchLiteLlmPricing,
	readBundledSnapshot,
	readPricingCache,
	resolvePricing,
	writePricingCache,
	LITELLM_PRICING_URL,
	PRICING_TTL_MS,
	PRICING_FETCH_TIMEOUT_MS,
} from '../lib/pricing';
export type { IPricingEntry, IPricingTable } from '../lib/pricing';
export {
	buildUsageTrackingToolRegistrations,
	buildReportToolRegistration,
	buildClearToolRegistration,
} from '../lib/tools';
export type {
	IUsageToolOptions,
	IReportToolOptions,
	IClearToolOptions,
} from '../lib/tools';
export type {
	GroupByAxis,
	IAgentDescriptor,
	IDegradation,
	IInvocationOutcome,
	IInvocationRecord,
	IHostLifecycleEvent,
	IObservedHostSession,
	ILimitsStatus,
	IModelDescriptor,
	IRollupBucket,
	IRollupTotals,
	IUsageSummary,
	IUsageTokens,
	ITokenAccounting,
	TokenAccountingStatus,
	ISessionHygieneAdvisory,
	ISessionHygienePolicy,
	ISessionHygieneSnapshot,
	SessionHygieneReason,
	HostLifecycleEventKind,
	SortBy,
	SpendBreachScope,
} from '../lib/types';
export {
	indexToolInvocationTelemetry,
	summarizeToolInvocationTelemetry,
} from '../lib/preferred-path-metrics';
