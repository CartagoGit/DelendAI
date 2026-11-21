/**
 * model-ranking.service.spec.ts — one ranking for every component that
 * chooses a model: capabilities, the mode, the dial, what was measured,
 * and whether a provider can work now.
 */
import { describe, expect, it } from 'vitest';

import type { IModelOutcome } from '../../../../src/lib/contracts/interfaces/model-outcome.interface';
import {
	rankModels,
	winRatesOf,
} from '../../../../src/lib/shared/model-ranking.service';

const model = (
	id: string,
	costTier: number,
	extra: Record<string, unknown> = {},
) => ({
	id,
	costTier,
	available: true,
	...extra,
});

const outcomes = (
	providerId: string,
	accepted: number,
	rejected: number,
	taskKind = 'review',
): IModelOutcome[] => [
	...Array.from({ length: accepted }, () => ({
		providerId,
		taskKind,
		outcome: 'accepted' as const,
		at: 't',
	})),
	...Array.from({ length: rejected }, () => ({
		providerId,
		taskKind,
		outcome: 'rejected' as const,
		at: 't',
	})),
];

describe('rankModels', () => {
	it('with nothing measured, follows capabilities, the mode and the dial', () => {
		const ranked = rankModels(
			[
				model('cheap', 1),
				model('strong', 4, { strengths: ['reasoning'] }),
				model('weak', 2, { weaknesses: ['reasoning'] }),
			],
			{ capabilities: ['reasoning'], mode: 'plan' },
			{ dial: 5 },
		);
		expect(ranked.map((each) => each.id)).toEqual([
			'strong',
			'cheap',
			'weak',
		]);
		expect(ranked[0]?.reasons).toContain('+2 strength:reasoning');
		const cheapFirst = rankModels(
			[model('a', 4), model('b', 1)],
			{},
			{ dial: 10 },
		);
		expect(cheapFirst.map((each) => each.id)).toEqual(['b', 'a']);
	});

	it('moves up a provider that did this kind of task well, and says on what evidence', () => {
		const winRates = winRatesOf(
			[
				...outcomes('mid', 9, 1),
				...outcomes('cheap', 1, 9),
				...outcomes('mid', 0, 5, 'implement'),
			],
			'review',
		);
		const ranked = rankModels(
			[model('cheap', 2), model('mid', 3)],
			{},
			{ dial: 5, winRates },
		);
		expect(ranked[0]).toMatchObject({
			id: 'mid',
			evidence: { winRate: 0.9, samples: 10 },
		});
		expect(winRatesOf(outcomes('few', 2, 0), 'review').has('few')).toBe(
			false,
		);
	});

	it('lists a provider that cannot work now last, with why, and keeps a pin first', () => {
		const ranked = rankModels(
			[
				model('down', 1, {
					available: false,
					unavailableReason: 'needs-plan',
				}),
				model('up', 4),
			],
			{},
			{ dial: 10 },
		);
		expect(ranked.map((each) => each.id)).toEqual(['up', 'down']);
		expect(ranked[1]?.reasons[0]).toContain('needs-plan');
		const pinned = rankModels(
			[model('a', 1), model('b', 5)],
			{},
			{ dial: 10, pinnedId: 'b' },
		);
		expect(pinned[0]).toMatchObject({ id: 'b', pinned: true });
	});
});
