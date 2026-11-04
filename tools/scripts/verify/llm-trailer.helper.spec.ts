/**
 * llm-trailer.helper.spec.ts — AI co-author trailers caught by the public
 * catalogue's vocabulary, including makers and versions no list named.
 */
import { describe, expect, it } from 'vitest';

import type { readModelCatalogue } from '@delendai/core/cli';

type IModelCatalogue = NonNullable<
	Awaited<ReturnType<typeof readModelCatalogue>>
>;

import { llmCoAuthorTrailers, makerVocabulary } from './llm-trailer.helper';

const CATALOGUE: IModelCatalogue = {
	fetchedAt: '',
	providers: [
		{ id: 'openai', name: 'OpenAI', env: [], models: ['gpt-6', 'o5-pro'] },
		{ id: 'moonshotai', name: 'Moonshot AI', env: [], models: ['kimi-k3'] },
		{ id: 'local-thing', name: 'Open Code', env: [], models: [] },
	],
};

describe('llmCoAuthorTrailers', () => {
	const vocabulary = makerVocabulary(CATALOGUE);

	it('takes its words from the catalogue, without the common ones', () => {
		expect(vocabulary).toContain('gpt');
		expect(vocabulary).toContain('kimi');
		expect(vocabulary).toContain('moonshot');
		expect(vocabulary).not.toContain('open');
		expect(vocabulary).not.toContain('code');
	});

	it('catches a version and a maker no hand list named', () => {
		const message =
			'fix: x\n\nCo-Authored-By: GPT-10 <noreply@x.test>\nco-authored-by: Kimi K3 <k@moonshot.test>';
		expect(llmCoAuthorTrailers(message, vocabulary)).toHaveLength(2);
	});

	it('leaves a person co-author, and a message without trailers, alone', () => {
		expect(
			llmCoAuthorTrailers(
				'fix\n\nCo-authored-by: Ana Ruiz <ana@example.test>',
				vocabulary,
			),
		).toEqual([]);
		expect(llmCoAuthorTrailers('fix: nothing here', vocabulary)).toEqual(
			[],
		);
		expect(llmCoAuthorTrailers('Co-authored-by: GPT-6', [])).toEqual([]);
	});
});
