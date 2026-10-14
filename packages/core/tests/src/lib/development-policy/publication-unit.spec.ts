/**
 * publication-unit.spec.ts — how a proposal becomes pull requests (f00554).
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_PUBLICATION } from '../../../../src/lib/contracts/constants/publication-granularity.constant';
import { expandProfile } from '../../../../src/lib/development-policy/profiles';
import { publicationUnitFor } from '../../../../src/lib/development-policy/publication-unit';
import { resolveDevelopmentPolicy } from '../../../../src/lib/development-policy/resolve';

const subject = (sliceCount: number, changedLines: number) => ({
	proposalId: 'x00001',
	sliceCount,
	changedLines,
});

describe('publicationUnitFor', () => {
	it('is adaptive by default, in every profile', () => {
		for (const profile of [
			'shared-direct',
			'shared-checkout-pr',
			'shared-checkout-merge',
			'worktree-pr',
		] as const) {
			expect(expandProfile(profile).integration.publication).toEqual(
				DEFAULT_PUBLICATION,
			);
		}
		expect(DEFAULT_PUBLICATION.granularity).toBe('adaptive');
	});

	it('publishes a small proposal as one pull request, at both thresholds', () => {
		const unit = publicationUnitFor(subject(3, 400), DEFAULT_PUBLICATION);
		expect(unit.unit).toBe('proposal');
		expect(unit.reason).toContain('x00001 is one pull request');
	});

	it('publishes a large proposal slice by slice, by either threshold', () => {
		expect(
			publicationUnitFor(subject(4, 10), DEFAULT_PUBLICATION).unit,
		).toBe('slice');
		const byLines = publicationUnitFor(
			subject(1, 401),
			DEFAULT_PUBLICATION,
		);
		expect(byLines.unit).toBe('slice');
		expect(byLines.reason).toContain('slice by slice');
	});

	it('always follows a declared slice or proposal granularity', () => {
		const huge = subject(40, 9000);
		const tiny = subject(1, 1);
		expect(
			publicationUnitFor(tiny, {
				...DEFAULT_PUBLICATION,
				granularity: 'slice',
			}).unit,
		).toBe('slice');
		expect(
			publicationUnitFor(huge, {
				...DEFAULT_PUBLICATION,
				granularity: 'proposal',
			}).unit,
		).toBe('proposal');
	});

	it('takes the project own thresholds from its development block', () => {
		const policy = resolveDevelopmentPolicy({
			development: {
				profile: 'shared-checkout-pr',
				integration: {
					publication: { adaptive: { maxSlices: 10 } },
				},
			},
		});
		expect(policy.integration.publication).toEqual({
			granularity: 'adaptive',
			adaptive: { maxSlices: 10, maxChangedLines: 400 },
		});
		expect(
			publicationUnitFor(subject(8, 100), policy.integration.publication)
				.unit,
		).toBe('proposal');
	});
});
