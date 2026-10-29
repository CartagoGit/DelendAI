/**
 * The protected-branch default is read from the resolved policy: the
 * release branch when it is a branch of its own, and the integration
 * branch when the profile forbids committing to it directly.
 */
import { describe, expect, it } from 'vitest';

import {
	deriveDefaultProtectedBranches,
	distinctReleaseBranch,
	UNRESOLVED_POLICY_PROTECTED_BRANCHES,
} from '@delendai/core/lib/development-policy/protected-branches';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';

const policyFor = (development: Record<string, unknown>) =>
	resolveDevelopmentPolicy({ development });

describe('deriveDefaultProtectedBranches', () => {
	it('protects release and integration under a merge profile', () => {
		expect(
			deriveDefaultProtectedBranches(
				policyFor({
					profile: 'shared-checkout-merge',
					branches: { integration: 'trunk', release: 'stable' },
				}),
			),
		).toEqual(['stable', 'trunk']);
	});

	it('leaves the integration branch open under shared-direct', () => {
		expect(
			deriveDefaultProtectedBranches(
				policyFor({
					profile: 'shared-direct',
					branches: { integration: 'trunk', release: 'stable' },
				}),
			),
		).toEqual(['stable']);
	});

	it('protects nothing extra for a single-branch direct project', () => {
		expect(
			deriveDefaultProtectedBranches(
				policyFor({
					profile: 'shared-direct',
					branches: { integration: 'main', release: 'main' },
				}),
			),
		).toEqual([]);
	});

	it('falls back to the forge defaults only when no policy resolved', () => {
		expect(deriveDefaultProtectedBranches(undefined)).toEqual(
			UNRESOLVED_POLICY_PROTECTED_BRANCHES,
		);
	});
});

describe('distinctReleaseBranch', () => {
	it('is absent when release is empty or equals integration', () => {
		expect(
			distinctReleaseBranch(
				policyFor({
					profile: 'shared-direct',
					branches: { integration: 'main', release: '' },
				}),
			),
		).toBeUndefined();
		expect(
			distinctReleaseBranch(
				policyFor({
					profile: 'shared-direct',
					branches: { integration: 'main', release: 'main' },
				}),
			),
		).toBeUndefined();
	});
});
