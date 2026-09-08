import { describe, expect, it } from 'vitest';

import {
	compileContextInputSchema,
	runCompileContext,
} from '../../../../src/lib/tools/compile-context.tool';

describe('compile_context tool', () => {
	it('validates input and returns structured context', async () => {
		const result = await runCompileContext(
			{
				namespacePrefix: 'proposals',
				dependencies: {
					search: async () => [],
					getDocument: async () => null,
					getSummary: async () => null,
				},
			},
			{ task: 'status', maxTokens: 50 },
		);
		expect(compileContextInputSchema.parse({ task: 'status', maxTokens: 50 })).toEqual({
			task: 'status',
			maxTokens: 50,
		});
		expect(result.tokens).toBe(0);
		expect(Object.keys(result.bands)).toEqual(['L0', 'L1', 'L2', 'L3', 'L4', 'L5']);
	});
});