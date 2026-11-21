/**
 * delegation-records.helper.spec.ts — the delegation records leave the
 * outcome the orchestrator reads, tagged with the task.
 */
import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IPlanOutcome } from '../../../../src/lib/dispatch/contracts';
import { takeDelegations } from '../../../../src/lib/dispatch/delegation-records.helper';

describe('takeDelegations', () => {
	it('moves each step record out of the outcome, with the task tags', () => {
		const outcome = fakePartial<IPlanOutcome, 'steps'>({
			steps: [
				fakePartial<IPlanOutcome['steps'][number], 'result'>({
					result: {
						subagentId: 's1',
						tokensUsed: 10,
						output: 'ok',
						schemaOk: true,
						hadError: false,
						delegation: {
							role: 'scout',
							delegation: 'manifest',
							tokensUsed: 10,
						},
					},
				}),
				fakePartial<IPlanOutcome['steps'][number], 'result'>({
					result: null,
				}),
			],
		});
		const taken = takeDelegations(outcome, ['refactor']);
		expect(taken.records).toEqual([
			{
				tags: ['refactor'],
				role: 'scout',
				delegation: 'manifest',
				tokensUsed: 10,
			},
		]);
		expect(taken.outcome.steps[0]?.result).not.toHaveProperty('delegation');
		expect(taken.outcome.steps[1]?.result).toBeNull();
	});
});
