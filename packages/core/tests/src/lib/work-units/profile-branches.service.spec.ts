/**
 * profile-branches.service.spec.ts — a branch no namespace of the
 * profile accounts for is reported, with its remedy.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import {
	branchesOutsideTheProfile,
	profileBranchesInvariant,
} from '@delendai/core/lib/work-units/profile-branches.service';

const policy = resolveDevelopmentPolicy({
	development: { profile: 'shared-checkout-pr' },
});

describe('branchesOutsideTheProfile', () => {
	it('names the branches an earlier profile left, and none the current one owns', () => {
		const work = `${policy.branches.workRefPrefix.replace(/^(refs\/)?heads\//u, '')}agent/implement/x00001-S1-g1/t`;
		expect(
			branchesOutsideTheProfile(
				[
					policy.branches.integration,
					work,
					'agent/x00001-S1',
					'feature/by-hand',
				],
				policy,
			),
		).toEqual(['agent/x00001-S1', 'feature/by-hand']);
	});

	it('holds with nothing outside, and says how to end what is', () => {
		expect(
			profileBranchesInvariant({
				branches: [policy.branches.integration],
				policy,
			}).holds,
		).toBe(true);
		const broken = profileBranchesInvariant({
			branches: ['agent/x00001-S1'],
			policy,
		});
		expect(broken.holds).toBe(false);
		expect(broken.observed).toBe('1: agent/x00001-S1');
		expect(broken.remedy).toContain('work enter');
	});
});
