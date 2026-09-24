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
import { DEVELOPMENT_PROFILES, WORK_REF_SHAPE } from './profiles.constant';
import { DEFAULT_PUBLICATION } from '../contracts/constants/publication-granularity.constant';

export type { IDevelopmentProfile } from './profiles.interface';
export {
	DEVELOPMENT_PROFILES,
	DEFAULT_DEVELOPMENT_PROFILE,
	WORK_REF_SHAPE,
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
	// Empty by default: a project adopting delendai should not inherit
	// the tool's name in its refs. `delendai.config.json` sets it here.
	namespacePrefix: '',
	// The documented shape, component by component:
	//
	//   <ns>/wip/<model>/<proposal>-<slice>-g<generation>/<what it is>
	//
	// `${agent}` is the exact model (`claude-opus-5`), never the machine
	// and never the editor. The unit of work and its generation form one
	// component so a client groups them; the explanation is its OWN
	// component, which is what makes a long description readable in a Git
	// client instead of a 90-character dash-run (x00563).
	workRefTemplate: `heads/wip/${WORK_REF_SHAPE}`,
	workRefPrefix: 'heads/wip/',
	workRefVisibility: 'visible',
	publicationRefPrefix: 'pr/',
	// `dependabot/*` is the forge's, not ours. A reaper that cannot tell
	// "not mine" from "abandoned" is a reaper nobody can safely enable.
	foreignRefPrefixes: ['dependabot/', 'renovate/', 'revert-'],
} as const;

/**
 * `shared-direct` — the model delendai supported before this contract.
 * Preserved verbatim so a project that chooses it keeps its historical
 * behaviour rather than being quietly migrated to something else.
 */

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
		publication: DEFAULT_PUBLICATION,
		// Deliberately EMPTY. A profile cannot know what this
		// project's CI calls its checks, and inventing a name is the
		// exact failure this repo already lived through: `main`
		// required a `ci-complete` context that no workflow produced,
		// so nothing could ever merge into it. An empty list makes
		// `enforced-governance-needs-checks` fire at config time with a
		// concrete remedy, which is a better outcome than a plausible
		// default that silently locks the branch.
		requiredChecks: [],
		// The candidate is proved in isolation BEFORE it is published
		// (`forge:publish` builds the commit, tests it in its own
		// worktree, and pushes the object it proved). Requiring the
		// forge to re-prove the same thing costs a full CI cycle per
		// candidate and, worse, makes every merge invalidate every
		// other open candidate: measured on this repository, six green
		// pull requests, none mergeable. The proof moved to where it is
		// cheap (~4s locally) instead of where it is quadratic.
		requireLatestIntegration: false,
		mergeGreenProgressContinuously: true,
		requiredApprovals: 0,
		releaseRequiredApprovals: 0,
		releaseRequiredChecks: [],
		// TRUE under this model. `forge:publish` builds the candidate
		// commit, proves it in its own worktree with its own install,
		// and pushes the object it proved — so work IS certified before
		// it leaves the machine, and a candidate that was not proved
		// must not be published. Leaving this false described a model
		// where the forge was the first thing to ever run the checks,
		// which stopped being true and made the startup declaration say
		// so out loud.
		requiresLocalCertification: true,
		// A squash DESTROYS the branch's commits: measured here, #116
		// arrived with four commits and landed as one, and after the
		// branch was deleted nothing recorded what had entered or when.
		// A merge commit keeps the work on its own line of development
		// and names the branch that produced it, so the lineage
		// survives the branch. `git log --first-parent` still gives the
		// one-line-per-change reading that squash was wanted for, which
		// makes the merge commit strictly more information for the same
		// cost — and it must be `--no-ff`, or git silently fast-forwards
		// whenever integration has not moved and the lineage is lost in
		// exactly the case nobody inspects.
		mergeMethod: 'merge',
		// The forge must NOT delete the branch when a pull request
		// merges. A work ref lives as long as the proposal it serves,
		// and a proposal lands one pull request per slice: GitHub's
		// switch would delete the branch at the first slice and strand
		// every slice after it. Deletion is delendai's call, made when
		// the proposal closes, because only delendai knows whether
		// slices remain.
		deleteMergedWorkRef: false,
		// Required by `mergeMethod: 'merge'` — a linear history forbids
		// the very merge commit that carries the lineage.
		linearHistory: false,
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
 * Shared tree, no work ref, committed straight onto the integration
 * branch. The oldest model, and still a legitimate choice for a solo
 * project that wants nothing between an edit and the branch.
 *
 * It is NOT the default any more: see `DEFAULT_DEVELOPMENT_PROFILE`.
 */
const SHARED_DIRECT: IResolvedDevelopmentPolicy = {
	...SHARED_CHECKOUT_PR,
	profile: 'shared-direct',
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
		publication: DEFAULT_PUBLICATION,
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
 * `worktree-pr` — one worktree per agent. HEAD movement is legitimate
 * here, so the checkout is not pinned and the agent tool surface keeps
 * the branch-switching capabilities the shared profiles withhold.
 */
const WORKTREE_PR: IResolvedDevelopmentPolicy = {
	version: DEVELOPMENT_POLICY_VERSION,
	profile: 'worktree-pr',
	source: 'profile',
	// The SAME shape as every other profile. It used to spell its own —
	// `agent/${agent}/${proposal}-${slice}` — with no namespace, no
	// generation and no topic, so the canon this project states once in
	// `WORK_REF_SHAPE` was true for three profiles out of four, and a
	// project on this one produced refs the reader attributes
	// differently. Where an agent works (a worktree of its own) is not
	// the same question as what its ref is called.
	branches: {
		...DEFAULT_BRANCHES,
		workRefTemplate: `heads/wip/${WORK_REF_SHAPE}`,
		workRefPrefix: 'heads/wip/',
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
		publication: DEFAULT_PUBLICATION,
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
