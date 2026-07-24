import { describe, expect, it } from 'vitest';

import { buildAutoEvaluateRegistration } from '../../../../src/lib/tools/auto-evaluate.tool';

describe('auto_evaluate tool', () => {
	it('reports task-scoped evidence and newly reachable providers', async () => {
		let handler:
			| ((args: {
					taskType?: string;
			  }) => Promise<{ structuredContent?: Record<string, unknown> }>)
			| undefined;
		const reg = buildAutoEvaluateRegistration({
			namespacePrefix: 'mcp',
			deps: {
				commandExists: async (command) => command === 'claude',
				env: {},
			},
			store: {
				append: async () => undefined,
				readAll: async () => [
					{
						providerId: 'claude-cli',
						success: true,
						taskType: 'review',
					},
					{
						providerId: 'claude-cli',
						success: true,
						taskType: 'review',
					},
					{
						providerId: 'claude-cli',
						success: false,
						taskType: 'review',
					},
				],
			},
		});
		await reg.register({
			registerTool: (
				_name: string,
				_config: unknown,
				fn: typeof handler,
			) => {
				handler = fn;
			},
		} as never);
		if (handler === undefined)
			throw new Error('auto_evaluate did not register');
		const body = (await handler({ taskType: 'review' }))
			.structuredContent as {
			winRates: { providerId: string; samples: number }[];
			unseenProviders: string[];
		};
		expect(body.winRates).toEqual([
			expect.objectContaining({ providerId: 'claude-cli', samples: 3 }),
		]);
		expect(body.unseenProviders).toEqual([]);
	});
});
