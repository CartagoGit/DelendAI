import { describe, expect, it } from 'vitest';

import {
	compileContext,
	type IContextCompilerDependencies,
} from '../../../../src/lib/services/context-compiler';

const dependencies: IContextCompilerDependencies = {
	search: async () => [
		{
			uid: 'f00001',
			kind: 'feat',
			status: 'ready',
			title: 'Cached context',
			snippet: 'full body should not be emitted',
			score: -2,
		},
	],
	getDocument: async () => ({
		uid: 'f00001',
		kind: 'feat',
		status: 'ready',
		title: 'Cached context',
		contentHash: 'hash-1',
		body: 'This body must not be used when a summary exists.',
		priority: 'P1',
		updatedAt: 10,
		relations: ['q00022'],
	}),
	getSummary: async () => 'Cached summary only.',
};

describe('compileContext', () => {
	it('uses FTS results, cached summaries, and stays within maxTokens', async () => {
		const result = await compileContext(
			{ task: 'cached context', maxTokens: 100 },
			dependencies,
		);
		const items = Object.values(result.bands).flat();
		expect(result.tokens).toBeLessThanOrEqual(100);
		expect(
			items.some(
				(item) =>
					item.band === 'L3' && item.text === 'Cached summary only.',
			),
		).toBe(true);
		expect(
			items.some((item) =>
				item.text.includes('This body must not be used'),
			),
		).toBe(false);
	});

	it('does not call an LLM and respects scope filtering', async () => {
		let summaryCalls = 0;
		let searchCalls = 0;
		const scoped = await compileContext(
			{ task: 'cached context', maxTokens: 20, scope: ['other'] },
			{
				...dependencies,
				search: async (task) => {
					searchCalls += 1;
					expect(task).toBe('cached context');
					return dependencies.search(task);
				},
				getSummary: async (hash) => {
					summaryCalls += 1;
					return dependencies.getSummary(hash);
				},
			},
		);
		expect(scoped.tokens).toBe(0);
		expect(searchCalls).toBe(1);
		expect(summaryCalls).toBe(0);
	});
});
