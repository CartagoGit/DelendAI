import { describe, expect, it } from 'vitest';

import type { IOutcomeRecord } from '@delendai/auto-agent-selector/public';
import type { IEvalAttempt } from '../eval/eval-harness';
import {
	attemptsToOutcomeRecords,
	summarizeWinRates,
	writeOutcomes,
} from './write-through';

const attempt = (
	providerId: string,
	costTier: number,
	costUsd: number,
	passed: boolean,
	skipped?: 'spend-denied',
): IEvalAttempt => ({
	providerId,
	costTier,
	costUsd,
	passed,
	...(skipped === undefined ? {} : { skipped }),
});

describe('prompt-eval calibration write-through (f00127 S3)', () => {
	it('writes one record per attempted provider per task', async () => {
		const records: IOutcomeRecord[] = [];
		await writeOutcomes(
			{
				attempts: [
					attempt('cheap', 1, 0.02, true),
					attempt('quality', 4, 0.2, false),
					attempt('skipped', 5, 0, false, 'spend-denied'),
				],
				winner: 'cheap',
				taskType: 'implement',
			},
			{
				store: {
					append: async (record) => {
						records.push(record);
					},
				},
			},
		);
		expect(records).toEqual([
			{ providerId: 'cheap', success: true, taskType: 'implement' },
			{ providerId: 'quality', success: false, taskType: 'implement' },
		]);
	});

	it('is a no-op when input has no winner', async () => {
		const records: IOutcomeRecord[] = [];
		await writeOutcomes(
			{
				attempts: [
					attempt('cheap', 1, 0.02, false),
					attempt('quality', 4, 0.2, false),
				],
				winner: null,
				taskType: 'review',
			},
			{
				store: {
					append: async (record) => {
						records.push(record);
					},
				},
			},
		);
		expect(records).toEqual([]);
	});

	it('is a no-op when no store is injected', async () => {
		await expect(
			writeOutcomes(
				{
					attempts: [
						attempt('cheap', 1, 0.02, true),
						attempt('quality', 4, 0.2, false),
					],
					winner: 'cheap',
					taskType: 'implement',
				},
				{},
			),
		).resolves.toBeUndefined();
	});

	it('respects the samples threshold', () => {
		expect(
			summarizeWinRates([
				{ providerId: 'cheap', success: true },
				{ providerId: 'cheap', success: true },
				{ providerId: 'cheap', success: false },
				{ providerId: 'cheap', success: true },
				{ providerId: 'cheap', success: false },
				{ providerId: 'quality', success: true },
				{ providerId: 'quality', success: true },
				{ providerId: 'quality', success: false },
				{ providerId: 'quality', success: true },
			]),
		).toEqual([{ providerId: 'cheap', winRate: 0.6, samples: 5 }]);
	});

	it('groups by taskType when present', () => {
		const records: IOutcomeRecord[] = [
			{ providerId: 'cheap', success: true, taskType: 'review' },
			{ providerId: 'cheap', success: true, taskType: 'review' },
			{ providerId: 'cheap', success: false, taskType: 'review' },
			{ providerId: 'cheap', success: true, taskType: 'review' },
			{ providerId: 'cheap', success: false, taskType: 'review' },
			{ providerId: 'quality', success: true, taskType: 'review' },
			{ providerId: 'quality', success: false, taskType: 'review' },
			{ providerId: 'quality', success: true, taskType: 'review' },
			{ providerId: 'quality', success: false, taskType: 'review' },
			{ providerId: 'quality', success: true, taskType: 'review' },
			{ providerId: 'cheap', success: false, taskType: 'implement' },
			{ providerId: 'cheap', success: false, taskType: 'implement' },
			{ providerId: 'cheap', success: false, taskType: 'implement' },
			{ providerId: 'cheap', success: false, taskType: 'implement' },
			{ providerId: 'cheap', success: true, taskType: 'implement' },
		];
		expect(summarizeWinRates(records, 'review')).toEqual([
			{ providerId: 'cheap', winRate: 0.6, samples: 5 },
			{ providerId: 'quality', winRate: 0.6, samples: 5 },
		]);
		expect(summarizeWinRates(records, 'implement')).toEqual([
			{ providerId: 'cheap', winRate: 0.2, samples: 5 },
		]);
	});

	it('returns empty when no records meet threshold', () => {
		expect(
			summarizeWinRates([
				{ providerId: 'cheap', success: true },
				{ providerId: 'cheap', success: false },
				{ providerId: 'quality', success: true },
			]),
		).toEqual([]);
	});

	it('maps eval attempts to winner-based outcomes without a parallel shape', () => {
		expect(
			attemptsToOutcomeRecords({
				attempts: [
					attempt('cheap', 1, 0.02, true),
					attempt('quality', 4, 0.2, false),
					attempt('skipped', 5, 0, false, 'spend-denied'),
				],
				winner: 'cheap',
				taskType: 'implement',
			}),
		).toEqual([
			{ providerId: 'cheap', success: true, taskType: 'implement' },
			{ providerId: 'quality', success: false, taskType: 'implement' },
		]);
	});
});
