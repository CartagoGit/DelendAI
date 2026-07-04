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
	attributeTool,
	deriveCorePrefix,
	CORE_PLUGIN_KEY,
} from '../lib/attribute';
export type { IToolAttribution } from '../lib/attribute';
export {
	buildRecord,
	extractModel,
	extractUsage,
	resolveSessionId,
} from '../lib/record';
export type { IBuildRecordInput } from '../lib/record';
export {
	bucketBy,
	buildSummary,
	computeTotals,
	readInvocations,
	regenerateSummary,
	withinWindow,
	writeSummary,
} from '../lib/rollup';
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
	IInvocationOutcome,
	IInvocationRecord,
	IModelDescriptor,
	IRollupBucket,
	IRollupTotals,
	IUsageSummary,
	IUsageTokens,
	SortBy,
} from '../lib/types';
