/**
 * profiles.ts — ergonomic presets that expand into an explicit
 * `IResolvedDevelopmentPolicy`.
 *
 * A profile is sugar and nothing more. Nothing in the runtime may branch
 * on a profile name: the expansion happens once, here, and every consumer
 * reads the resolved capability booleans. That is what lets a new
 * combination be added without an `if (profile === …)` cascade appearing
 * across the codebase.
 *
 * A project may name a profile and then override individual axes; the
 * resolver deep-merges the override onto the expansion, so selecting a
 * preset never costs you the ability to differ from it in one field.
 */

import {
	DEVELOPMENT_POLICY_VERSION,
	type IResolvedDevelopmentPolicy,
} from '../contracts/interfaces/development-policy.interface';

/** Built-in preset ids. Projects may also write `custom` axes directly. */
export const DEVELOPMENT_PROFILES = [
	/** Shared tree, commits straight onto the integration branch. */
	'shared-direct',
	/** Shared tree, WIP refs without checkout, integrated by pull request. */
	'shared-checkout-pr',
	/** One worktree per agent, each on a branch, integrated by pull request. */
	'worktree-pr',
] as const;
export type DevelopmentProfile = (typeof DEVELOPMENT_PROFILES)[number];

export const isDevelopmentProfile = (
	value: string,
): value is DevelopmentProfile =>
	(DEVELOPMENT_PROFILES as readonly string[]).includes(value);

/**
 * Branch identities are intentionally NOT part of a profile: they are
 * per-project facts, and inferring them from the forge's `default_branch`
 * is exactly the mistake this policy exists to prevent. The resolver
 * supplies them; a profile only describes the shape of the workflow.
 */
const DEFAULT_BRANCHES = {
	integration: 'develop',
	release: 'main',
	workRefTemplate: 'wip/${agent}/${proposal}-${slice}-g${generation}',
	workRefPrefix: 'wip/',
} as const;

/**
 * `shared-direct` — the model delendai supported before this contract.
 * Preserved verbatim so a project that chooses it keeps its historical
 * behaviour rather than being quietly migrated to something else.
 */
const SHARED_DIRECT: IResolvedDevelopmentPolicy = {
	version: DEVELOPMENT_POLICY_VERSION,
	profile: 'shared-direct',
	source: 'profile',
	branches: { ...DEFAULT_BRANCHES, workRefTemplate: '', workRefPrefix: '' },
	workspace: {
		strategy: 'shared-checkout',
		shared: true,
		agentWorktrees: false,
		pinnedCheckout: true,
	},
	persistence: {
		strategy: 'direct-commit',
		usesWipRefs: false,
		exactScope: false,
		allowsDirectIntegrationCommit: true,
	},
	checkpoint: {
		strategy: 'continuous',
		intervalMinutes: 5,
		durableWip: false,
	},
	integration: {
		strategy: 'direct',
		requiresPullRequest: false,
		requiredChecks: [],
		requireLatestIntegration: false,
		mergeGreenProgressContinuously: false,
		requiredApprovals: 0,
		releaseRequiredApprovals: 0,
		mergeMethod: 'squash',
		deleteMergedWorkRef: false,
		linearHistory: true,
		allowForcePush: false,
		allowDeleteIntegrationBranch: false,
	},
	coordination: {
		strategy: 'file-locks',
		requiresClaims: true,
		leaseTtlMinutes: 30,
	},
	recovery: {
		strategy: 'none',
		resumeExistingWork: false,
		neverDiscardUnmergedWork: true,
	},
	governance: {
		strategy: 'observed',
		enforced: false,
		failClosedOnUnverifiable: false,
	},
};

/**
 * `shared-checkout-pr` — the model delendai and tanit migrate to. The
 * visible checkout never leaves the integration branch; agents persist to
 * `wip/*` refs built with plumbing, and only certified progress lands.
 */
const SHARED_CHECKOUT_PR: IResolvedDevelopmentPolicy = {
	version: DEVELOPMENT_POLICY_VERSION,
	profile: 'shared-checkout-pr',
	source: 'profile',
	branches: { ...DEFAULT_BRANCHES },
	workspace: {
		strategy: 'shared-checkout',
		shared: true,
		agentWorktrees: false,
		pinnedCheckout: true,
	},
	persistence: {
		strategy: 'wip-ref',
		usesWipRefs: true,
		exactScope: true,
		allowsDirectIntegrationCommit: false,
	},
	checkpoint: {
		strategy: 'continuous',
		intervalMinutes: 5,
		durableWip: true,
	},
	integration: {
		strategy: 'pull-request',
		requiresPullRequest: true,
		requiredChecks: ['ci-complete'],
		requireLatestIntegration: true,
		mergeGreenProgressContinuously: true,
		requiredApprovals: 0,
		releaseRequiredApprovals: 0,
		mergeMethod: 'squash',
		deleteMergedWorkRef: true,
		linearHistory: true,
		allowForcePush: false,
		allowDeleteIntegrationBranch: false,
	},
	coordination: {
		strategy: 'sqlite-leases',
		requiresClaims: true,
		leaseTtlMinutes: 30,
	},
	recovery: {
		strategy: 'resume-wip',
		resumeExistingWork: true,
		neverDiscardUnmergedWork: true,
	},
	governance: {
		strategy: 'enforced',
		enforced: true,
		failClosedOnUnverifiable: true,
	},
};

/**
 * `worktree-pr` — one worktree per agent. HEAD movement is legitimate
 * here, so the checkout is not pinned and the agent tool surface keeps
 * the branch-switching capabilities the shared profiles withhold.
 */
const WORKTREE_PR: IResolvedDevelopmentPolicy = {
	version: DEVELOPMENT_POLICY_VERSION,
	profile: 'worktree-pr',
	source: 'profile',
	branches: {
		...DEFAULT_BRANCHES,
		workRefTemplate: 'agent/${agent}/${proposal}-${slice}',
		workRefPrefix: 'agent/',
	},
	workspace: {
		strategy: 'agent-worktree',
		shared: false,
		agentWorktrees: true,
		pinnedCheckout: false,
	},
	persistence: {
		strategy: 'branch',
		usesWipRefs: false,
		exactScope: false,
		allowsDirectIntegrationCommit: false,
	},
	checkpoint: {
		strategy: 'slice',
		intervalMinutes: 0,
		durableWip: false,
	},
	integration: {
		strategy: 'pull-request',
		requiresPullRequest: true,
		requiredChecks: ['ci-complete'],
		requireLatestIntegration: true,
		mergeGreenProgressContinuously: false,
		requiredApprovals: 0,
		releaseRequiredApprovals: 0,
		mergeMethod: 'squash',
		deleteMergedWorkRef: true,
		linearHistory: true,
		allowForcePush: false,
		allowDeleteIntegrationBranch: false,
	},
	coordination: {
		strategy: 'none',
		requiresClaims: false,
		leaseTtlMinutes: 0,
	},
	recovery: {
		strategy: 'resume-wip',
		resumeExistingWork: true,
		neverDiscardUnmergedWork: true,
	},
	governance: {
		strategy: 'enforced',
		enforced: true,
		failClosedOnUnverifiable: true,
	},
};

const BY_ID: Readonly<Record<DevelopmentProfile, IResolvedDevelopmentPolicy>> =
	{
		'shared-direct': SHARED_DIRECT,
		'shared-checkout-pr': SHARED_CHECKOUT_PR,
		'worktree-pr': WORKTREE_PR,
	};

/**
 * The policy a workspace gets when nothing at all is configured. It is
 * deliberately the historical model: installing a newer delendai must not
 * silently change how an existing project integrates work.
 */
export const DEFAULT_DEVELOPMENT_PROFILE: DevelopmentProfile = 'shared-direct';

/** Expand a preset. Returns a fresh object; callers may not mutate BY_ID. */
export const expandProfile = (
	profile: DevelopmentProfile,
): IResolvedDevelopmentPolicy => structuredClone(BY_ID[profile]);
