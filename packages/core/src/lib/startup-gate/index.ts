/**
 * index.ts — the startup gate's surface.
 *
 * The gate is the ONLY supported way to reach `reconcileStartup` from a
 * boot: it consults the resolved development policy first, builds the
 * real seams, and returns a verdict that a host cannot render as clean
 * when it is not. Exposing the pieces individually would let a caller
 * skip the policy gate (and reconcile a `shared-direct` project on every
 * boot) or skip the renderer (and swallow a DEGRADED verdict) — the two
 * failures this module exists to prevent.
 */

export {
	createStartupEnvironmentSeam,
	deriveMachineId,
	type IStartupEnvironmentSeamOptions,
	type IStartupHostFacts,
	parseRepositoryKey,
} from './environment-seam';
export {
	decideStartupReconciliation,
	type IStartupReconciliationGate,
} from './policy-gate';
export {
	renderStartupGate,
	STARTUP_RECONCILIATION_CODE,
	startupGateWarnings,
} from './render-gate';
export {
	type IRunStartupGateInput,
	OPTIONAL_STARTUP_PHASES,
	runStartupGate,
	type TStartupGateOutcome,
} from './run-startup-gate';
export {
	createStateDatabaseSeam,
	type IStateDatabaseSeamOptions,
	probeStateDatabase,
	type TStateDatabaseOpen,
	type TStatePortsOpener,
} from './state-database-seam';
export {
	createStartupGovernanceSeam,
	type IGovernanceSeamOptions,
} from './governance-seam';
