/**
 * Public barrel for @mcp-vertex/orchestrator-runner.
 *
 * Re-exports the pure, reusable pieces (the scorer, the decision builder,
 * the session/health stores, the dependency guard) plus the local types.
 * The plugin itself is the default export of `../index.ts`.
 */
export { default } from '../index';

export {
	scoreProvider,
	explainScore,
	MODE_TIER,
	UNAVAILABLE_SCORE,
} from '../lib/router/score';
export {
	buildRoutingDecision,
	strategyForKind,
	type IAdviseInput,
} from '../lib/router/advise';
export {
	SessionStore,
	DEFAULT_SESSION_TTL_SECONDS,
	DEFAULT_PRUNE_INTERVAL_MS,
	type ISessionStoreOptions,
} from '../lib/router/session';
export { HealthStore } from '../lib/healthcheck/store';
export {
	buildProviderHealth,
	availabilityFromHealth,
	commandOf,
} from '../lib/healthcheck/report';
export { installHintFor } from '../lib/healthcheck/install-hints';
export { probeCli, type ProbeRunner } from '../lib/healthcheck/probe';
export {
	readQuotaSnapshot,
	type IQuotaSnapshot,
} from '../lib/quota/read-quota';
export {
	mergeQuotaSources,
	buildQuotaSnapshot,
	httpHeaderSample,
	writeQuotaSnapshot,
	type QuotaWindow,
	type QuotaSource,
	type IQuotaObservation,
	type IProviderQuotaSample,
	type IQuotaSnapshotFile,
} from '../lib/quota';
export {
	DISCOVERABLE_CLIS,
	discoverProviders,
	parseAuthTier,
	probeAuthTier,
	buildRosterDraft,
	writeRosterDraft,
	readConfirmedProviders,
	draftProviderEntry,
	buildProvidersPatch,
	composeBootstrapBrief,
	ROSTER_DRAFT_SCHEMA,
	type DiscoverableCli,
	type IDiscoveredProvider,
	type IMissingProvider,
	type IDiscoveryResult,
	type IRosterDraft,
	type IJsonPatchOp,
} from '../lib/bootstrap';
export {
	buildDiscoverProvidersRegistration,
	buildBootstrapProvidersRegistration,
	type IDiscoverProvidersToolOptions,
	type IBootstrapProvidersToolOptions,
} from '../lib/tools';
export {
	assertUsageTrackingLoaded,
	USAGE_TRACKING_PLUGIN,
} from '../lib/guard';
export { resolveLoopDetectionSeam } from '../lib/loop-detection-seam';
export {
	OptionsSchema,
	DEFAULT_OPTIONS,
	type OrchestratorRunnerOptions,
} from '../lib/options';
export type {
	CostPreference,
	IRoutingHint,
	IInstallHint,
	IProviderHealthReport,
	ICliProbeResult,
	ILoopDetectionSeam,
} from '../lib/types';
