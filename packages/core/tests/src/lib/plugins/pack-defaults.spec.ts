import { describe, expect, it } from 'vitest';

import {
	PACK_DEFAULTS,
	resolveSearchHybridWeights,
} from '@delendai/core/public';

describe('pack defaults', () => {
	it('keeps balanced hybrid weights when no stack is selected', () => {
		expect(resolveSearchHybridWeights()).toEqual({
			bm25: 0.5,
			vector: 0.5,
		});
		expect(PACK_DEFAULTS.default).toEqual({
			search: { hybridWeights: { bm25: 0.5, vector: 0.5 } },
		});
	});

	it('biases toward vectors for TypeScript-heavy stacks', () => {
		expect(resolveSearchHybridWeights('typescript-heavy')).toEqual({
			bm25: 0.4,
			vector: 0.6,
		});
	});

	it('biases toward bm25 for documentation-only stacks', () => {
		expect(resolveSearchHybridWeights('documentation-only')).toEqual({
			bm25: 0.7,
			vector: 0.3,
		});
	});
});
