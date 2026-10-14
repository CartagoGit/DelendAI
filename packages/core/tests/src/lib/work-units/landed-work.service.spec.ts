/**
 * landed-work.service.spec.ts — a tip that only merged landed work in
 * carries nothing of its own.
 */
import { describe, expect, it } from 'vitest';

import { parentsOutsideMerges } from '@delendai/core/lib/work-units/landed-work.service';

describe('parentsOutsideMerges', () => {
	it('names the parents outside the merges, for the caller to check against the base', () => {
		expect(
			parentsOutsideMerges(['m2 m1 d2', 'm1 w1 d1'].join('\n')),
		).toEqual(['d2', 'w1', 'd1']);
	});

	it('answers undefined as soon as one commit beyond the base is not a merge', () => {
		expect(
			parentsOutsideMerges(['m1 w1 d1', 'w1 b0'].join('\n')),
		).toBeUndefined();
	});

	it('has nothing to check for a tip at the base', () => {
		expect(parentsOutsideMerges('')).toEqual([]);
	});
});
