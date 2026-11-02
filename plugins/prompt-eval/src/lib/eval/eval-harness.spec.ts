import { describe, expect, it } from 'vitest';

import { runEvalHarness } from './eval-harness';

const providers = [
	{ id: 'cheap', label: 'Cheap', costTier: 1 as const },
	{ id: 'quality', label: 'Quality', costTier: 4 as const },
];

describe('runEvalHarness', () => {
	it('records cost and chooses the cheapest passing provider', async () => {
		const result = await runEvalHarness(
			{ prompt: 'fix the test', providers },
			{
				allowSpend: async () => true,
				runProvider: async (provider) => ({
					output: provider.id,
					costUsd: provider.id === 'cheap' ? 0.02 : 0.1,
				}),
				checkAcceptance: async (output) => output === 'cheap',
			},
		);
		expect(result).toMatchObject({
			winner: 'cheap',
			passed: 1,
			totalCostUsd: 0.12,
		});
	});

	it('never invokes a provider rejected by the spend guard', async () => {
		let invocations = 0;
		const result = await runEvalHarness(
			{ prompt: 'review', providers },
			{
				allowSpend: async (provider) => provider.id !== 'quality',
				runProvider: async () => {
					invocations += 1;
					return { output: 'ok', costUsd: 0 };
				},
				checkAcceptance: async () => true,
			},
		);
		expect(invocations).toBe(1);
		expect(result.attempts[1]).toMatchObject({ skipped: 'spend-denied' });
	});
});
