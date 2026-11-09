/**
 * landed-work.service.spec.ts — a tip that only merged landed work in
 * carries nothing of its own.
 */
import { describe, expect, it } from 'vitest';

import { parentsOutsideMerges } from '@delendai/core/lib/integration/decisions/landed.helper';

describe('parentsOutsideMerges', () => {
	it('[<50ms] names the parents outside the merges, for the caller to check against the base', () => {
		expect(
			parentsOutsideMerges(['m2 m1 d2', 'm1 w1 d1'].join('\n')),
		).toEqual(['d2', 'w1', 'd1']);
	});

	it('[<50ms] answers undefined as soon as one commit beyond the base is not a merge', () => {
		expect(
			parentsOutsideMerges(['m1 w1 d1', 'w1 b0'].join('\n')),
		).toBeUndefined();
	});

	it('[<50ms] has nothing to check for a tip at the base', () => {
		expect(parentsOutsideMerges('')).toEqual([]);
	});
});

describe('pullRequestLanded', () => {
	it('[<20ms] landed when the forge merged it or its head is contained', async () => {
		const { pullRequestLanded } = await import(
			'@delendai/core/lib/integration/decisions/landed.helper'
		);
		expect(pullRequestLanded({ merged: true, headContained: false })).toBe(
			true,
		);
		expect(pullRequestLanded({ merged: false, headContained: true })).toBe(
			true,
		);
		expect(pullRequestLanded({ merged: false, headContained: false })).toBe(
			false,
		);
	});
});
