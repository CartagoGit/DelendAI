/**
 * release-target.spec.ts — a release moves what the project's policy says.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';
import {
	resolveReleasePromotion,
	resolveReleaseTarget,
} from '@delendai/core/lib/development-policy/release-target';

const policyFor = (development: Record<string, unknown>) =>
	resolveDevelopmentPolicy({ development });

describe('resolveReleaseTarget', () => {
	it('reads the two branches of a pull-request project', () => {
		const target = resolveReleaseTarget(
			policyFor({
				profile: 'shared-checkout-pr',
				branches: { integration: 'develop', release: 'main' },
			}),
			'packages/core/package.json',
		);
		expect(target).toEqual({
			integrationBranch: 'develop',
			releaseBranch: 'main',
			versionManifestPath: 'packages/core/package.json',
			promotion: 'pull-request',
		});
	});

	it('follows custom branch names and defaults the manifest to the root', () => {
		const target = resolveReleaseTarget(
			policyFor({
				profile: 'shared-checkout-pr',
				branches: { integration: 'trunk', release: 'stable' },
			}),
		);
		expect(target).toMatchObject({
			integrationBranch: 'trunk',
			releaseBranch: 'stable',
			versionManifestPath: 'package.json',
			promotion: 'pull-request',
		});
	});

	it('has no promotion when one branch integrates and releases', () => {
		expect(
			resolveReleasePromotion(
				policyFor({
					profile: 'shared-checkout-pr',
					branches: { integration: 'main' },
				}),
			),
		).toBe('none');
		expect(
			resolveReleasePromotion(
				policyFor({
					profile: 'shared-checkout-pr',
					branches: { integration: 'main', release: 'main' },
				}),
			),
		).toBe('none');
	});

	it('derives promotion from the integration strategy', () => {
		const branches = { integration: 'trunk', release: 'stable' };
		expect(
			resolveReleasePromotion(
				policyFor({ profile: 'shared-checkout-merge', branches }),
			),
		).toBe('merge');
		expect(
			resolveReleasePromotion(
				policyFor({ profile: 'shared-direct', branches }),
			),
		).toBe('direct');
	});
});
