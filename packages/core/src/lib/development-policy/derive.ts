/**
 * derive.ts — recomputes every capability boolean from the axis
 * strategies it follows from.
 *
 * The capability flags on `IResolvedDevelopmentPolicy` are what the
 * runtime actually reads, so they must never contradict the strategy that
 * produced them. They are therefore derived, not configured: an operator
 * who overrides `persistence.strategy` to `wip-ref` gets `usesWipRefs`
 * and `exactScope` updated for free, and cannot author the impossible
 * combination `{ strategy: 'wip-ref', usesWipRefs: false }`.
 *
 * The resolver calls this LAST, after profile expansion and after any
 * per-axis overrides have been merged in.
 */

import type {
	CoordinationStrategy,
	GovernanceStrategy,
	IResolvedDevelopmentPolicy,
	IntegrationStrategy,
	PersistenceStrategy,
	RecoveryStrategy,
	WorkspaceStrategy,
} from '../contracts/interfaces/development-policy.interface';

const workspaceFlags = (strategy: WorkspaceStrategy) => ({
	shared: strategy === 'shared-checkout',
	agentWorktrees: strategy === 'agent-worktree',
	// A shared tree is only safe if nobody moves HEAD out from under the
	// other agents; a per-agent worktree is the case where moving HEAD is
	// the whole point.
	pinnedCheckout: strategy === 'shared-checkout',
});

const persistenceFlags = (
	strategy: PersistenceStrategy,
	integration: IntegrationStrategy,
) => ({
	usesWipRefs: strategy === 'wip-ref',
	// Only the wip-ref model builds its commit from a temporary index, so
	// only it can promise a checkpoint contains nothing but claimed paths.
	exactScope: strategy === 'wip-ref',
	// Direct commits onto the integration branch are a property of BOTH
	// axes: committing directly is meaningless if a pull request is
	// required to land anything.
	allowsDirectIntegrationCommit:
		strategy === 'direct-commit' && integration === 'direct',
});

const coordinationFlags = (strategy: CoordinationStrategy) => ({
	requiresClaims: strategy !== 'none',
});

const integrationFlags = (strategy: IntegrationStrategy) => ({
	requiresPullRequest: strategy === 'pull-request',
});

const recoveryFlags = (strategy: RecoveryStrategy) => ({
	resumeExistingWork: strategy === 'resume-wip',
});

const governanceFlags = (strategy: GovernanceStrategy) => ({
	enforced: strategy === 'enforced',
});

/**
 * Returns a copy of `policy` whose capability booleans agree with its
 * strategies. Values that are genuine operator choices rather than
 * consequences — lease TTL, checkpoint interval, required checks,
 * `neverDiscardUnmergedWork`, `failClosedOnUnverifiable` — are passed
 * through untouched.
 */
export const deriveCapabilities = (
	policy: IResolvedDevelopmentPolicy,
): IResolvedDevelopmentPolicy => {
	// Persistence is derived first: the checkpoint axis depends on the
	// FRESH `usesWipRefs`, not on whatever the incoming object happened to
	// carry before an override changed the strategy under it.
	const persistence = {
		...policy.persistence,
		...persistenceFlags(
			policy.persistence.strategy,
			policy.integration.strategy,
		),
	};

	return {
		...policy,
		workspace: {
			...policy.workspace,
			...workspaceFlags(policy.workspace.strategy),
		},
		persistence,
		checkpoint: {
			...policy.checkpoint,
			// An interval only means anything to a strategy that uses one.
			intervalMinutes:
				policy.checkpoint.strategy === 'slice'
					? 0
					: policy.checkpoint.intervalMinutes,
			// A red checkpoint is only ever acceptable when it lands
			// somewhere that is not the integration branch.
			durableWip:
				policy.checkpoint.durableWip && persistence.usesWipRefs,
		},
		integration: {
			...policy.integration,
			...integrationFlags(policy.integration.strategy),
		},
		coordination: {
			...policy.coordination,
			...coordinationFlags(policy.coordination.strategy),
		},
		recovery: {
			...policy.recovery,
			...recoveryFlags(policy.recovery.strategy),
		},
		governance: {
			...policy.governance,
			...governanceFlags(policy.governance.strategy),
		},
	};
};
