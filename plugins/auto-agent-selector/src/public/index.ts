/**
 * Public barrel for `@delendai/auto-agent-selector` — the discovery
 * primitives, for hosts/tests that want to reason about the provider roster
 * without registering the plugin.
 */
export { discoverRoster } from '../lib/discovery/discover-roster';
export { discoverAndPersistRoster } from '../lib/discovery/discover-roster';
export { realDiscoveryDeps } from '../lib/discovery/real-deps';
export {
	installKnownCli,
	type IProviderInstallResult,
} from '../lib/discovery/install-provider';
export {
	realRosterSnapshotStore,
	type IRosterSnapshotStore,
} from '../lib/discovery/roster-store';
export { rankProviders } from '../lib/routing/rank-providers';
export { buildDashboard } from '../lib/dashboard/view-model';
export type {
	IBuildDashboardInput,
	IDashboardRow,
	IDashboardViewModel,
	IRecommendationRow,
	IProviderSpend,
	ISpendSummary,
} from '../lib/contracts/interfaces/dashboard.interface';
export type {
	IRankInput,
	IRankedProvider,
} from '../lib/contracts/interfaces/ranking.interface';
export type {
	ICalibrationStore,
	IOutcomeRecord,
	IProviderWinRate,
} from '../lib/contracts/interfaces/calibration.interface';
export { buildEscalationLadder } from '../lib/escalate/build-ladder';
export { runWithEscalation } from '../lib/escalate/run-with-escalation';
export { buildAutoEvaluateRegistration } from '../lib/tools/auto-evaluate.tool';
export type {
	IBuildLadderInput,
	IEscalationOutcome,
	IEscalationPlan,
	IEscalationRung,
	IRunEscalationDeps,
} from '../lib/contracts/interfaces/escalation.interface';
export {
	KNOWN_APIS,
	KNOWN_CLIS,
	type IKnownApi,
	type IKnownCli,
} from '../lib/contracts/constants/known-providers.constant';
export type {
	IDiscoveredRoster,
	IDiscoveryDeps,
	IMissingProvider,
	IProviderCandidate,
	ProviderSource,
} from '../lib/contracts/interfaces/roster.interface';
