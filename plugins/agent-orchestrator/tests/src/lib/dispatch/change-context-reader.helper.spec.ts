/**
 * change-context-reader.helper.spec.ts — context-for-change is asked with
 * the project's own options, and only its sections are kept.
 */
import { describe, expect, it } from 'vitest';

import { changeContextReader } from '../../../../src/lib/dispatch/change-context-reader.helper';

describe('changeContextReader', () => {
	it("passes the project's options and returns the sections", async () => {
		const asked: unknown[] = [];
		const read = changeContextReader({
			workspaceRoot: '/w',
			namespacePrefix: 'delendai',
			options: { maxBytes: 1000, memoryStorePath: '.cache/memory.json' },
			load: async () => ({
				runContextForChange: async (args, options) => {
					asked.push({ args, options });
					return {
						structuredContent: {
							sections: [{ source: 'code', summary: 'a' }],
						},
					};
				},
			}),
		});
		expect(await read(['a.ts'])).toEqual([
			{ source: 'code', summary: 'a' },
		]);
		expect(asked).toEqual([
			{
				args: { files: ['a.ts'] },
				options: {
					namespacePrefix: 'delendai',
					workspaceRootAbs: '/w',
					maxBytes: 1000,
					memoryStorePath: '.cache/memory.json',
				},
			},
		]);
	});

	it('uses its default budget, and reads no sections from an answer without them', async () => {
		let budget = 0;
		const read = changeContextReader({
			workspaceRoot: '/w',
			namespacePrefix: 'delendai',
			options: {},
			load: async () => ({
				runContextForChange: async (_args, options) => {
					budget = options.maxBytes;
					return { isError: true };
				},
			}),
		});
		expect(await read(['a.ts'])).toEqual([]);
		expect(budget).toBe(24_000);
	});

	it('loads the real plugin when nothing is injected', async () => {
		const read = changeContextReader({
			workspaceRoot: '/nonexistent-workspace',
			namespacePrefix: 'delendai',
			options: {},
		});
		await expect(read([])).resolves.toBeDefined();
	});
});
