/**
 * resolve.spec.ts — the canonical development policy is what every other
 * consumer derives from, so these tests pin the two properties that make
 * it safe to build on: a project that upgrades without editing its config
 * keeps its historical behaviour, and a project that names a profile gets
 * that profile's model expanded explicitly rather than interpreted.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import { validateDevelopmentPolicy } from '@delendai/core/lib/development-policy/validate';
import { DEVELOPMENT_POLICY_VERSION } from '@delendai/core/lib/contracts/interfaces/development-policy.interface';

/** The `commit-policy` options this repo actually shipped before f-policy. */
const LEGACY_COMMIT_POLICY = {
	push: {
		enabled: true,
		onCommit: true,
		force: 'with-lease',
		protectedBranches: ['main', 'master'],
		remote: 'origin',
		branch: 'develop',
	},
	cadence: {
		triggers: [{ kind: 'slice' }, { kind: 'interval', minutes: 5 }],
		sliceScoping: false,
		allowForeignChanges: true,
	},
};

describe('resolveDevelopmentPolicy — backward compatibility', () => {
	it('gives an unconfigured project a ref of its own, asking nothing of its forge', () => {
		// This used to assert `direct`: no work ref at all, every agent
		// committing straight onto the integration branch. As the DEFAULT,
		// that made the whole work-ref model opt-in — and opt-in only for
		// projects whose forge has pull requests, since the two profiles
		// that granted a work ref were the `shared-checkout-*` pair.
		//
		// `merge` asks nothing of the forge: no review object, no branch
		// protection, nothing a plain git remote cannot do. Every agent
		// gets a ref of its own and the LOCAL gate certifies before the
		// work lands.
		const policy = resolveDevelopmentPolicy({});

		expect(policy.source).toBe('default');
		expect(policy.integration.strategy).toBe('merge');
		expect(policy.integration.requiresPullRequest).toBe(false);
		expect(policy.integration.requiresLocalCertification).toBe(true);
		expect(policy.persistence.usesWipRefs).toBe(true);
		expect(policy.branches.workRefTemplate.length).toBeGreaterThan(0);
		expect(policy.persistence.allowsDirectIntegrationCommit).toBe(false);
		expect(policy.version).toBe(DEVELOPMENT_POLICY_VERSION);
	});

	it('still offers the historical model to a project that asks for it', () => {
		const policy = resolveDevelopmentPolicy({
			development: { profile: 'shared-direct' },
		});
		expect(policy.integration.strategy).toBe('direct');
		expect(policy.persistence.usesWipRefs).toBe(false);
		expect(policy.branches.workRefTemplate).toBe('');
	});

	it('maps the pre-policy fields instead of ignoring them', () => {
		const policy = resolveDevelopmentPolicy({
			legacy: {
				agentWorktree: false,
				commitPolicyOptions: LEGACY_COMMIT_POLICY,
			},
		});

		expect(policy.source).toBe('legacy-compat');
		// The branch agents integrate into comes from the legacy push
		// target, never from the forge's default branch.
		expect(policy.branches.integration).toBe('develop');
		// slice + interval triggers together are the continuous case.
		expect(policy.checkpoint.strategy).toBe('continuous');
		expect(policy.checkpoint.intervalMinutes).toBe(5);
		// `force: 'with-lease'` is not a force-push authorisation.
		expect(policy.integration.allowForcePush).toBe(false);
	});

	it('does not silently migrate a legacy project to the new model', () => {
		const policy = resolveDevelopmentPolicy({
			legacy: { commitPolicyOptions: LEGACY_COMMIT_POLICY },
		});

		expect(policy.integration.requiresPullRequest).toBe(false);
		expect(policy.persistence.usesWipRefs).toBe(false);
		expect(validateDevelopmentPolicy(policy)).toEqual([]);
	});

	it('maps agentWorktree onto the workspace axis only', () => {
		const policy = resolveDevelopmentPolicy({
			legacy: {
				agentWorktree: true,
				commitPolicyOptions: LEGACY_COMMIT_POLICY,
			},
		});

		expect(policy.workspace.agentWorktrees).toBe(true);
		expect(policy.workspace.pinnedCheckout).toBe(false);
		expect(policy.persistence.strategy).toBe('branch');
		// agentWorktree never implied pull requests, so it must not add them.
		expect(policy.integration.requiresPullRequest).toBe(false);
	});
});

describe('resolveDevelopmentPolicy — profiles', () => {
	it('expands shared-checkout-pr into the new model', () => {
		const policy = resolveDevelopmentPolicy({
			development: {
				profile: 'shared-checkout-pr',
				// Named because the profile deliberately ships none.
				integration: { requiredChecks: ['delendai-validate'] },
			},
		});

		expect(policy.workspace.shared).toBe(true);
		expect(policy.workspace.pinnedCheckout).toBe(true);
		expect(policy.persistence.usesWipRefs).toBe(true);
		expect(policy.persistence.exactScope).toBe(true);
		expect(policy.persistence.allowsDirectIntegrationCommit).toBe(false);
		expect(policy.integration.requiresPullRequest).toBe(true);
		// False BY DESIGN: the candidate is proved against integration
		// before it is published, so requiring the forge to re-prove it
		// only serialises merges behind CI.
		expect(policy.integration.requireLatestIntegration).toBe(false);
		// The lineage of a merged branch must survive the branch.
		expect(policy.integration.mergeMethod).toBe('merge');
		expect(policy.integration.linearHistory).toBe(false);
		expect(policy.integration.mergeGreenProgressContinuously).toBe(true);
		expect(policy.recovery.resumeExistingWork).toBe(true);
		expect(validateDevelopmentPolicy(policy)).toEqual([]);
	});

	it('still supports the worktree model', () => {
		const policy = resolveDevelopmentPolicy({
			development: {
				profile: 'worktree-pr',
				integration: { requiredChecks: ['delendai-validate'] },
			},
		});

		expect(policy.workspace.agentWorktrees).toBe(true);
		expect(policy.workspace.pinnedCheckout).toBe(false);
		expect(policy.integration.requiresPullRequest).toBe(true);
		expect(validateDevelopmentPolicy(policy)).toEqual([]);
	});

	it('still supports direct integration', () => {
		const policy = resolveDevelopmentPolicy({
			development: { profile: 'shared-direct' },
		});

		expect(policy.integration.strategy).toBe('direct');
		expect(validateDevelopmentPolicy(policy)).toEqual([]);
	});

	it('gives two profiles different governance', () => {
		const direct = resolveDevelopmentPolicy({
			development: { profile: 'shared-direct' },
		});
		const pr = resolveDevelopmentPolicy({
			development: { profile: 'shared-checkout-pr' },
		});

		expect(direct.governance.enforced).toBe(false);
		expect(pr.governance.enforced).toBe(true);
		expect(direct.integration.requiredChecks).toEqual([]);
		// Both are empty until the project names its own; the
		// difference between the two profiles is that only one of them
		// REQUIRES that naming (see the validator).
		expect(pr.integration.requiredChecks).toEqual([]);
	});

	it('lets a project override one axis without losing the profile', () => {
		const policy = resolveDevelopmentPolicy({
			development: {
				profile: 'shared-checkout-pr',
				branches: { integration: 'trunk', release: 'stable' },
				integration: { requiredChecks: ['verify'] },
			},
		});

		expect(policy.branches.integration).toBe('trunk');
		expect(policy.branches.release).toBe('stable');
		expect(policy.integration.requiredChecks).toEqual(['verify']);
		// Everything the override did not mention survives.
		expect(policy.persistence.usesWipRefs).toBe(true);
	});
});

describe('resolveDevelopmentPolicy — derived capabilities', () => {
	it('recomputes capability flags when an override changes a strategy', () => {
		const policy = resolveDevelopmentPolicy({
			development: {
				profile: 'shared-direct',
				persistence: { strategy: 'wip-ref' },
				integration: { strategy: 'pull-request' },
			},
		});

		// The flags follow the overridden strategies, not the profile's.
		expect(policy.persistence.usesWipRefs).toBe(true);
		expect(policy.persistence.exactScope).toBe(true);
		expect(policy.persistence.allowsDirectIntegrationCommit).toBe(false);
		expect(policy.integration.requiresPullRequest).toBe(true);
	});

	it('is idempotent — resolving a resolved policy changes nothing', () => {
		const once = resolveDevelopmentPolicy({
			development: { profile: 'shared-checkout-pr' },
		});
		const twice = resolveDevelopmentPolicy({
			development: {
				profile: 'shared-checkout-pr',
				branches: once.branches,
				workspace: { strategy: once.workspace.strategy },
				persistence: { strategy: once.persistence.strategy },
				checkpoint: {
					strategy: once.checkpoint.strategy,
					intervalMinutes: once.checkpoint.intervalMinutes,
					durableWip: once.checkpoint.durableWip,
				},
				integration: {
					strategy: once.integration.strategy,
					requiredChecks: once.integration.requiredChecks,
					requireLatestIntegration:
						once.integration.requireLatestIntegration,
					mergeGreenProgressContinuously:
						once.integration.mergeGreenProgressContinuously,
					mergeMethod: once.integration.mergeMethod,
					deleteMergedWorkRef: once.integration.deleteMergedWorkRef,
					linearHistory: once.integration.linearHistory,
					allowForcePush: once.integration.allowForcePush,
					allowDeleteIntegrationBranch:
						once.integration.allowDeleteIntegrationBranch,
				},
				coordination: {
					strategy: once.coordination.strategy,
					leaseTtlMinutes: once.coordination.leaseTtlMinutes,
				},
				recovery: {
					strategy: once.recovery.strategy,
					neverDiscardUnmergedWork:
						once.recovery.neverDiscardUnmergedWork,
				},
				governance: {
					strategy: once.governance.strategy,
					failClosedOnUnverifiable:
						once.governance.failClosedOnUnverifiable,
				},
			},
		});

		expect(twice).toEqual(once);
	});
});
