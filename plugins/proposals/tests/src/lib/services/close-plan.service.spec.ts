import { describe, expect, it } from 'vitest';

import { runClosePlanTransitionService } from '@delendai/proposals/lib/services/close-plan.service';

describe('close-plan service', () => {
	it('returns conflict with blockers when transition loses a child-close race', async () => {
		const result = await runClosePlanTransitionService({
			context: {
				planId: 'q00047',
				status: 'review',
				absPath: 'review/q00047-plan.md',
				folder: 'review',
				reason: 'close plan',
				idempotencyKey: 'idem-q00047',
			},
			runTransition: async () => ({
				isError: true,
				content: [{ text: 'transition failed' }],
			}),
			rerunPreflight: async () => ({
				planId: 'q00047',
				closable: false,
				reasons: [
					{
						ref: 'f00001',
						kind: 'proposal',
						code: 'not-done',
						message: 'child proposal is still review',
					},
				],
				children: [],
				depth: 1,
			}),
			transitionRejectedNextAction: 'retry',
		});

		expect(result.isError).toBeUndefined();
		expect(result.structuredContent).toMatchObject({
			ok: false,
			kind: 'conflict',
			planId: 'q00047',
			idempotencyKey: 'idem-q00047',
			blockers: [
				{
					ref: 'f00001',
					code: 'not-done',
				},
			],
		});
	});
});