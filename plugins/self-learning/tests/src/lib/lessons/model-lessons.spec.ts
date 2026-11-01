/**
 * model-lessons.spec.ts — which model did each kind of task best, from the
 * shared outcome store, with what it cost and how much it rests on.
 */
import type { IModelOutcome } from '@delendai/core/contracts';
import { describe, expect, it } from 'vitest';

import { modelLessons } from '../../../../src/lib/lessons/model-lessons.helper';

const NOW = Date.parse('2026-10-19T00:00:00.000Z');
const at = '2026-10-18T00:00:00.000Z';
const judged = (
	providerId: string,
	taskKind: string,
	accepted: number,
	rejected: number,
	costUsd?: number,
): IModelOutcome[] => [
	...Array.from({ length: accepted }, () => ({
		providerId,
		taskKind,
		outcome: 'accepted' as const,
		at,
		...(costUsd === undefined
			? {}
			: {
					cost: {
						amount: costUsd,
						unit: 'usd' as const,
						kind: 'measured' as const,
					},
				}),
	})),
	...Array.from({ length: rejected }, () => ({
		providerId,
		taskKind,
		outcome: 'rejected' as const,
		at,
	})),
];

describe('modelLessons', () => {
	it('names the provider that did each kind of task best, with cost per accepted result', () => {
		const lessons = modelLessons(
			[
				...judged('opus', 'review', 9, 1, 0.2),
				...judged('minimax', 'review', 5, 5),
				{
					providerId: 'opus',
					taskKind: 'review',
					outcome: 'unknown',
					at,
				},
			],
			{ nowMs: NOW, recencyWindowMs: 7 * 86_400_000 },
		);
		expect(lessons).toHaveLength(1);
		expect(lessons[0]).toMatchObject({
			kind: 'model-for-task',
			subject: 'review',
			evidenceCount: 10,
			confidence: {
				support: 9,
				counterExamples: 1,
				recentSupport: 9,
				band: 'high',
			},
		});
		expect(lessons[0]?.claim).toBe(
			'opus did best at review: 9 of 10 accepted (90%), about 0.200 usd per accepted result.',
		);
	});

	it('says when an answer rests on fewer outcomes than the ranking trusts', () => {
		const [lesson] = modelLessons(judged('codex', 'implement', 2, 0), {
			nowMs: NOW,
			recencyWindowMs: 1,
		});
		expect(lesson?.confidence.band).toBe('low');
		expect(lesson?.claim).toContain('fewer than the 5 the ranking trusts');
		expect(lesson?.confidence.recentSupport).toBe(0);
	});
});
