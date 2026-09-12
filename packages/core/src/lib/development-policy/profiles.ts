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

import type { IDevelopmentProfile } from './profiles.interface';
import { DEVELOPMENT_PROFILES } from './profiles.constant';

export type { IDevelopmentProfile } from './profiles.interface';
export {
	DEVELOPMENT_PROFILES,
	DEFAULT_DEVELOPMENT_PROFILE,
} from './profiles.constant';

export const isDevelopmentProfile = (
	value: string,
): value is IDevelopmentProfile =>
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
	// EVERYTHING delendai creates lives under `delendai/`, so "is this
	// ref mine?" is answerable by looking at it. The old `wip/` sat in a
	// namespace of its own, which meant a guard, a reaper and a forge
	// rule each had to know two prefixes and agree about both — and
	// `refs/wip/DESKTOP-9CTQRS7/...` appearing in a log told nobody
	// which tool had made it.
	workRefTemplate:
		'delendai/wip/${agent}/${proposal}-${slice}-g${generation}',
	workRefPrefix: 'delendai/wip/',
	// Overridden per strategy by `resolve.ts`: a merge model must not
	// inherit `pr/` from the profile it is spread from.
	publicationRefPrefix: 'delendai/pr/',
	// `dependabot/*` is the forge's, not ours. A reaper that cannot tell
	// "not mine" from "abandoned" is a reaper nobody can safely enable.
	foreignRefPrefixes: ['dependabot/', 'renovate/', 'revert-'],
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
		anchoredToIntegrationBranch: true,
	},
	persistence: {
		strategy: 'direct-commit',
		usesWipRefs: false,
		exactScope: false,
		allowsDirectIntegrationCommit: true,
		autoCommitOnTask: true,
		autoPushAfterCommit: true,
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
		releaseRequiredChecks: [],
		requiresLocalCertification: false,
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
		anchoredToIntegrationBranch: true,
	},
	persistence: {
		strategy: 'wip-ref',
		usesWipRefs: true,
		exactScope: true,
		allowsDirectIntegrationCommit: false,
		autoCommitOnTask: true,
		autoPushAfterCommit: true,
	},
	checkpoint: {
		strategy: 'continuous',
		intervalMinutes: 5,
		durableWip: true,
	},
	integration: {
		strategy: 'pull-request',
		requiresPullRequest: true,
		// Deliberately EMPTY. A profile cannot know what this
		// project's CI calls its checks, and inventing a name is the
		// exact failure this repo already lived through: `main`
		// required a `ci-complete` context that no workflow produced,
		// so nothing could ever merge into it. An empty list makes
		// `enforced-governance-needs-checks` fire at config time with a
		// concrete remedy, which is a better outcome than a plausible
		// default that silently locks the branch.
		requiredChecks: [],
		requireLatestIntegration: true,
		mergeGreenProgressContinuously: true,
		requiredApprovals: 0,
		releaseRequiredApprovals: 0,
		releaseRequiredChecks: [],
		requiresLocalCertification: false,
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
		// Still under `delendai/`: a worktree host's branches are just
		// as much ours as a shared checkout's, and a namespace that
		// depends on the profile is a namespace nothing can check.
		workRefTemplate: 'delendai/agent/${agent}/${proposal}-${slice}',
		workRefPrefix: 'delendai/agent/',
	},
	workspace: {
		strategy: 'agent-worktree',
		shared: false,
		agentWorktrees: true,
		pinnedCheckout: false,
		anchoredToIntegrationBranch: false,
	},
	persistence: {
		strategy: 'branch',
		usesWipRefs: false,
		exactScope: false,
		allowsDirectIntegrationCommit: false,
		autoCommitOnTask: true,
		autoPushAfterCommit: true,
	},
	checkpoint: {
		strategy: 'slice',
		intervalMinutes: 0,
		durableWip: false,
	},
	integration: {
		strategy: 'pull-request',
		requiresPullRequest: true,
		// Empty for the same reason as `shared-checkout-pr` above.
		requiredChecks: [],
		requireLatestIntegration: true,
		mergeGreenProgressContinuously: false,
		requiredApprovals: 0,
		releaseRequiredApprovals: 0,
		releaseRequiredChecks: [],
		requiresLocalCertification: false,
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

/**
 * `shared-checkout-merge` — the same working model as
 * `shared-checkout-pr`, integrated without a pull request.
 *
 * WHY this exists as a first-class profile and not as a degraded mode:
 * plenty of real projects live on a forge the team does not administer,
 * or on one where merge requests are simply not how the team works. The
 * value of this model — a stable shared checkout, exact-scope
 * checkpoints, claims, resumable work — has nothing to do with pull
 * requests. Only the last step does.
 *
 * WHAT CHANGES is who certifies. There is no forge object to hold a
 * check, so `requiresLocalCertification` is on and the local gate stops
 * being advisory: work that has not passed it does not reach the
 * integration branch. "We do not use pull requests" must never quietly
 * become "nothing is checked".
 *
 * WHAT DOES NOT CHANGE is that agents still own work rather than
 * branches. The work ref is still built with plumbing, still published,
 * still deleted once its content is in the integration branch.
 *
 * Governance is `observed`, not `enforced`: on a forge we do not
 * administer, writing settings would fail, and pretending to enforce
 * what we cannot write is exactly the drift this policy exists to stop.
 * Drift is still REPORTED — `failClosedOnUnverifiable` stays on.
 */
const SHARED_CHECKOUT_MERGE: IResolvedDevelopmentPolicy = {
	...SHARED_CHECKOUT_PR,
	profile: 'shared-checkout-merge',
	integration: {
		...SHARED_CHECKOUT_PR.integration,
		strategy: 'merge',
		requiresPullRequest: false,
		requiresLocalCertification: true,
		// No forge check can be required on a forge we do not
		// administer. The gate that certifies runs here.
		requiredChecks: [],
		releaseRequiredChecks: [],
		// A merge still has to be built on the current integration head:
		// two independently-green units can combine into a red branch
		// whether or not a pull request was involved.
		requireLatestIntegration: true,
		// Nobody can approve on a forge with no review object. Asking for
		// an approval that cannot exist would block every merge.
		requiredApprovals: 0,
		releaseRequiredApprovals: 0,
	},
	governance: {
		strategy: 'observed',
		enforced: false,
		failClosedOnUnverifiable: true,
	},
};

const BY_ID: Readonly<Record<IDevelopmentProfile, IResolvedDevelopmentPolicy>> =
	{
		'shared-direct': SHARED_DIRECT,
		'shared-checkout-pr': SHARED_CHECKOUT_PR,
		'shared-checkout-merge': SHARED_CHECKOUT_MERGE,
		'worktree-pr': WORKTREE_PR,
	};

/** Expand a preset. Returns a fresh object; callers may not mutate BY_ID. */
export const expandProfile = (
	profile: IDevelopmentProfile,
): IResolvedDevelopmentPolicy => structuredClone(BY_ID[profile]);
