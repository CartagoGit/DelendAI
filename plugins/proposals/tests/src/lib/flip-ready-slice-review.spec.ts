import { describe, expect, it } from 'vitest';

import { flipSliceStatusReview } from '@delendai/proposals/lib/swarm/proposal-review';

describe('flipSliceStatusReview on a ready slice', () => {
	it('[<7ms] says review once a ready slice is handed in', () => {
		expect(flipSliceStatusReview('- **Status**: ready\n- x')).toBe(
			'- **Status**: review\n- x',
		);
	});
});
