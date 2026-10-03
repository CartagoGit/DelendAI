import { describe, expect, it } from 'vitest';

import { runBench } from '../../../../src/lib/bench/bench-runner';

describe('runBench', () => {
	it('computes ops/s for constant samples', () => {
		expect(runBench('constant', [10, 10, 10])).toEqual({
			name: 'constant',
			ops: 100,
			sampleCount: 3,
			meanMs: 10,
			p95Ms: 10,
		});
	});
});
