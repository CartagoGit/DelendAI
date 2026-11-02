import { describe, expect, it } from 'vitest';

import {
	buildApiEmbedder,
	EmbedderUnavailableError,
	type IApiEmbedderFetch,
} from '../../../../src/lib/embed/build-api-embedder';

describe('buildApiEmbedder', () => {
	it('returns vectors through a mocked fetch', async () => {
		const fetch: IApiEmbedderFetch = async () => ({
			ok: true,
			status: 200,
			json: async () => ({
				data: [{ embedding: [0.1, 0.2, 0.3] }],
			}),
		});
		const embedder = buildApiEmbedder({
			providerId: 'openai',
			apiKey: 'sk-test',
			fetch,
		});

		await expect(embedder.embed('needle')).resolves.toEqual([
			0.1, 0.2, 0.3,
		]);
	});

	it('throws embedder-unavailable on upstream HTTP failures', async () => {
		const fetch: IApiEmbedderFetch = async () => ({
			ok: false,
			status: 503,
			json: async () => ({}),
		});
		const embedder = buildApiEmbedder({
			providerId: 'openai',
			apiKey: 'sk-test',
			fetch,
		});

		await expect(embedder.embed('needle')).rejects.toMatchObject({
			name: EmbedderUnavailableError.name,
			code: 'embedder-unavailable',
			providerId: 'openai',
		});
	});
});
