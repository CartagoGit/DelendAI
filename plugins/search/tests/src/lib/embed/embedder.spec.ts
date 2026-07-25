import { describe, expect, it } from 'vitest';

import {
	buildDeterministicHashEmbedder,
	DEFAULT_EMBED_DIMENSIONS,
} from '../../../../src/lib/embed/embedder';

describe('deterministic hash embedder', async () => {
	it('returns the same vector for the same input', async () => {
		const embedder = buildDeterministicHashEmbedder();

		const first = await embedder.embed('alpha beta gamma');
		const second = await embedder.embed('alpha beta gamma');

		expect(first).toEqual(second);
		expect(first).toHaveLength(DEFAULT_EMBED_DIMENSIONS);
	});

	it('returns a different vector for different input', async () => {
		const embedder = buildDeterministicHashEmbedder();

		const first = await embedder.embed('alpha beta gamma');
		const second = await embedder.embed('omega delta');

		expect(first).not.toEqual(second);
	});
});
