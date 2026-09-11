/**
 * derived-invariants.spec.ts — the two properties that are DERIVED rather
 * than validated, and the profile that exists so a project without pull
 * requests still gets the model.
 *
 * These are not in `validate.spec.ts` on purpose. A property that is
 * derived from the strategy it follows from cannot be authored wrongly,
 * so there is no violation to assert; what needs pinning is that the
 * derivation actually happens, for every profile, including one nobody
 * has written a config for yet.
 */
import { describe, expect, it } from 'vitest';

import { DEVELOPMENT_PROFILES } from '@delendai/core/lib/development-policy/profiles';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import { validateDevelopmentPolicy } from '@delendai/core/lib/development-policy/validate';

const resolve = (development: Record<string, unknown>) =>
	resolveDevelopmentPolicy({ development });

describe('the shared checkout is anchored to the configured branch', () => {
	it('anchors every shared-tree profile, and no worktree profile', () => {
		for (const profile of DEVELOPMENT_PROFILES) {
			const policy = resolve({ profile });
			expect(policy.workspace.anchoredToIntegrationBranch, profile).toBe(
				policy.workspace.strategy === 'shared-checkout',
			);
		}
	});

	it('anchors to the branch the project names, not to `develop`', () => {
		// The failure this guards: an invariant written against a literal
		// silently stops holding for a project that integrates on `next`.
		const policy = resolve({
			profile: 'shared-checkout-pr',
			branches: { integration: 'next' },
		});
		expect(policy.workspace.anchoredToIntegrationBranch).toBe(true);
		expect(policy.branches.integration).toBe('next');
	});

	it('cannot be turned off while the tree is still shared', () => {
		// Not a validation rule — an impossibility. The flag is recomputed
		// from the workspace strategy after any override is merged in.
		const policy = resolve({
			profile: 'shared-checkout-pr',
			workspace: { anchoredToIntegrationBranch: false },
		} as Record<string, unknown>);
		expect(policy.workspace.anchoredToIntegrationBranch).toBe(true);
	});
});

describe('shared-checkout-merge — the model without pull requests', () => {
	const policy = resolve({ profile: 'shared-checkout-merge' });

	it('is coherent with nothing configured', () => {
		// Unlike the pull-request profiles, this one needs no check names
		// from the project: there is no forge gate to name them for.
		expect(validateDevelopmentPolicy(policy)).toEqual([]);
	});

	it('keeps everything about the working model and changes only the landing', () => {
		expect(policy.workspace.strategy).toBe('shared-checkout');
		expect(policy.persistence.usesWipRefs).toBe(true);
		expect(policy.persistence.exactScope).toBe(true);
		expect(policy.coordination.requiresClaims).toBe(true);
		expect(policy.recovery.resumeExistingWork).toBe(true);
		expect(policy.integration.requiresPullRequest).toBe(false);
	});

	it('moves the gate instead of removing it', () => {
		// The whole risk of a no-pull-request model is that "we do not
		// review here" quietly becomes "nothing is checked here".
		expect(policy.integration.requiresLocalCertification).toBe(true);
		expect(policy.persistence.allowsDirectIntegrationCommit).toBe(false);
	});

	it('still refuses to land work built on a stale integration head', () => {
		// Two independently green units can combine into a red branch
		// whether or not a pull request was involved.
		expect(policy.integration.requireLatestIntegration).toBe(true);
	});

	it('does not claim to enforce settings on a forge it may not administer', () => {
		expect(policy.governance.enforced).toBe(false);
		// But drift is still reported: unverifiable is never a pass.
		expect(policy.governance.failClosedOnUnverifiable).toBe(true);
	});

	it('is the only profile that certifies locally', () => {
		for (const profile of DEVELOPMENT_PROFILES) {
			expect(
				resolve({ profile }).integration.requiresLocalCertification,
				profile,
			).toBe(profile === 'shared-checkout-merge');
		}
	});
});

describe('work is committed and pushed unless the operator says otherwise', () => {
	it('defaults both on in every profile', () => {
		// Work that exists only as unsaved edits in a shared tree is work
		// any other agent's operation can lose, and a checkpoint that
		// never leaves this clone cannot be resumed by anybody.
		for (const profile of DEVELOPMENT_PROFILES) {
			const { persistence } = resolve({ profile });
			expect(persistence.autoCommitOnTask, profile).toBe(true);
			expect(persistence.autoPushAfterCommit, profile).toBe(true);
		}
	});

	it('lets a project turn them off, because it is a choice and not a consequence', () => {
		const policy = resolve({
			profile: 'shared-direct',
			persistence: { autoPushAfterCommit: false },
		});
		expect(policy.persistence.autoPushAfterCommit).toBe(false);
	});
});
