/**
 * f00129 — public surface for the observability plugin.
 *
 * Re-exports the S1 error/issue contracts and parsers so plugin
 * authors can build alternative sources (e.g. a self-hosted
 * GlitchTip/Sentry-compatible API) without forking the contracts.
 */
export type {
	IErrorSource,
	IFetchLike,
	IObsIssue,
	IListErrorsInput,
	IListErrorsOutput,
} from '../lib/errors/ierror-source';
export {
	authHeaderFor,
	dispatchFetch,
	redactToken,
} from '../lib/errors/ierror-source';
export {
	buildProvenanceGraph,
	PROVENANCE_NODE_KINDS,
	PROVENANCE_RELATION_DEFINITIONS,
} from '../lib/provenance';
export {
	listRecentErrors,
	normalizeLevel,
	sentryBuildListUrl,
	sentryParseList,
} from '../lib/errors/list-errors';
export { buildObsErrorsToolRegistration } from '../lib/tools/obs-errors.tool';
export type { IObsErrorsToolOptions } from '../lib/tools/obs-errors.tool';
export { buildObsHealthToolRegistration } from '../lib/tools/obs-health.tool';
export type { IObsHealthToolOptions } from '../lib/tools/obs-health.tool';
export { buildObsRuntimeMetricsToolRegistration } from '../lib/tools/obs-runtime-metrics.tool';
export { createRuntimeMetricsRegistry } from '../lib/metrics/runtime-metrics-registry';
export type {
	IObsRuntimeMetricsToolOptions,
	IRuntimeMetricsRegistry,
	IRuntimeMetricsSnapshot,
} from '../lib/contracts/interfaces/observability.interface';
export type {
	IProvenanceEdge,
	IProvenanceEventInput,
	IProvenanceGraph,
	IProvenanceLinkOptions,
	IProvenanceNode,
	ProvenanceNodeKind,
	ProvenanceRelation,
} from '../lib/provenance';
// `computePayloadPercentile`/`IPayloadPercentile` now live in
// `@mcp-vertex/core` (the shared contract with `adaptive-optimizer` and the
// metrics longitudinal gate); re-exported here so this plugin's public
// surface is unchanged for existing consumers.
export { computePayloadPercentile } from '@mcp-vertex/core/public';
export type { IPayloadPercentile } from '@mcp-vertex/core/public';
