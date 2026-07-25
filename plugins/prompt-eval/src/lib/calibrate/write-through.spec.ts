import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { computeWinRates } from '../../../../auto-agent-selector/src/lib/calibrate/win-rates';
import { realCalibrationStore } from '../../../../auto-agent-selector/src/lib/calibrate/store';
import type { IEvalAttempt } from '../eval/eval-harness';
import {
	attemptsToOutcomeRecords,
	readCalibrationWinRates,
	resolveAutoAgentSelectorCalibrationDir,
	writeCalibration,
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
	it('writes the auto-agent-selector JSONL format', async () => {
		const cacheDir = await mkdtemp(join(tmpdir(), 'prompt-eval-cal-'));
		try {
			const store = realCalibrationStore(
				resolveAutoAgentSelectorCalibrationDir(cacheDir),
			);
			await writeCalibration(
				{
					attempts: [
						attempt('cheap', 1, 0.02, true),
						attempt('quality', 4, 0.2, false),
						attempt('skipped', 5, 0, false, 'spend-denied'),
					],
					taskType: 'implement',
				},
				{ store },
			);
			const raw = await readFile(
				join(
					resolveAutoAgentSelectorCalibrationDir(cacheDir),
					'calibration.jsonl',
				),
				'utf8',
			);
			expect(raw.trim().split('\n')).toHaveLength(2);
			const parsed = raw
				.trim()
				.split('\n')
				.map((line) => JSON.parse(line) as Record<string, unknown>);
			expect(parsed).toEqual([
				{
					providerId: 'cheap',
					success: true,
					taskType: 'implement',
					ts: expect.any(String),
				},
				{
					providerId: 'quality',
					success: false,
					taskType: 'implement',
					ts: expect.any(String),
				},
			]);
		} finally {
			await rm(cacheDir, { recursive: true, force: true });
		}
	});

	it('reads win-rates in the same S4 contract shape', async () => {
		const cacheDir = await mkdtemp(join(tmpdir(), 'prompt-eval-read-'));
		try {
			const store = realCalibrationStore(
				resolveAutoAgentSelectorCalibrationDir(cacheDir),
			);
			await writeCalibration(
				{
					attempts: [
						attempt('cheap', 1, 0.02, true),
						attempt('cheap', 1, 0.02, true),
						attempt('quality', 4, 0.2, false),
					],
					taskType: 'review',
				},
				{ store },
			);
			const readBack = await readCalibrationWinRates({
				store,
				taskType: 'review',
			});
			expect(readBack).toEqual([
				{ providerId: 'cheap', winRate: 1, samples: 2 },
				{ providerId: 'quality', winRate: 0, samples: 1 },
			]);
		} finally {
			await rm(cacheDir, { recursive: true, force: true });
		}
	});

	it('round-trips attempts into the same summary auto-agent-selector computes', async () => {
		const cacheDir = await mkdtemp(
			join(tmpdir(), 'prompt-eval-roundtrip-'),
		);
		try {
			const store = realCalibrationStore(
				resolveAutoAgentSelectorCalibrationDir(cacheDir),
			);
			const attempts = [
				attempt('cheap', 1, 0.02, true),
				attempt('cheap', 1, 0.02, false),
				attempt('quality', 4, 0.2, true),
			] as const;
			const written = await writeCalibration(
				{ attempts, taskType: 'implement' },
				{ store },
			);
			const records = await store.readAll();
			expect(written.winRates).toEqual(
				computeWinRates(records, 1, 'implement'),
			);
		} finally {
			await rm(cacheDir, { recursive: true, force: true });
		}
	});

	it('maps eval attempts to persisted outcomes without a parallel shape', () => {
		expect(
			attemptsToOutcomeRecords({
				attempts: [
					attempt('cheap', 1, 0.02, true),
					attempt('skipped', 5, 0, false, 'spend-denied'),
				],
				taskType: 'implement',
			}),
		).toEqual([
			{ providerId: 'cheap', success: true, taskType: 'implement' },
		]);
	});
});
