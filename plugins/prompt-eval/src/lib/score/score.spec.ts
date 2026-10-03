import { describe, expect, it } from 'vitest';

import { scoreReport, scoreProvider, scorePerTaskType } from './score';
import type { IEvalAttempt } from '../eval/eval-harness';

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

describe('scoreProvider', () => {
	it('returns null win-rate when no attempts ran', () => {
		const score = scoreProvider('p', []);
		expect(score.winRate).toBe(null);
		expect(score.attempts).toBe(0);
		expect(score.passes).toBe(0);
		expect(score.totalCostUsd).toBe(0);
		expect(score.compositeScore).toBe(0);
	});

	it('counts a skipped attempt as zero passes but counts the spend', () => {
		const score = scoreProvider('p', [
			attempt('p', 2, 0.05, false, 'spend-denied'),
		]);
		expect(score.attempts).toBe(0);
		expect(score.passes).toBe(0);
		expect(score.totalCostUsd).toBe(0.05);
		expect(score.winRate).toBe(null);
	});

	it('computes win-rate and composite score from a mix of pass/fail', () => {
		const score = scoreProvider('p', [
			attempt('p', 3, 0.1, true),
			attempt('p', 3, 0.1, false),
			attempt('p', 3, 0.1, false),
		]);
		expect(score.attempts).toBe(3);
		expect(score.passes).toBe(1);
		expect(score.totalCostUsd).toBeCloseTo(0.3, 6);
		expect(score.winRate).toBeCloseTo(1 / 3, 6);
		expect(score.compositeScore).toBeCloseTo((1 / 3) * 100 - 0.3, 6);
	});

	it('ignores attempts from other providers', () => {
		const score = scoreProvider('p', [
			attempt('p', 2, 0.05, true),
			attempt('q', 4, 0.5, true),
		]);
		expect(score.attempts).toBe(1);
		expect(score.passes).toBe(1);
		expect(score.totalCostUsd).toBe(0.05);
	});
});

describe('scoreReport', () => {
	it('ranks the cheapest passing provider first', () => {
		const report = scoreReport([
			attempt('cheap', 1, 0.02, true),
			attempt('quality', 4, 0.1, true),
			attempt('flaky', 3, 0.5, false),
		]);
		expect(report.winner).toBe('cheap');
		expect(report.rows[0]?.providerId).toBe('cheap');
		expect(report.totalCostUsd).toBeCloseTo(0.62, 6);
		expect(report.totalPasses).toBe(2);
	});

	it('returns winner=null when no provider passed', () => {
		const report = scoreReport([
			attempt('a', 1, 0.05, false),
			attempt('b', 2, 0.1, false),
		]);
		expect(report.winner).toBe(null);
	});

	it('breaks ties by composite score, then cost asc, then tier asc', () => {
		const report = scoreReport([
			attempt('a', 1, 0.05, true),
			attempt('b', 1, 0.05, true),
		]);
		// Same composite → same cost → same tier → stable order from input.
		expect(report.rows.map((r) => r.providerId)).toEqual(['a', 'b']);
	});

	it('surfaces worst as the last row, even when winner is null', () => {
		const report = scoreReport([
			attempt('a', 3, 0.5, false),
			attempt('b', 4, 0.1, false),
		]);
		expect(report.winner).toBe(null);
		expect(report.worst).toBe('a');
	});
});

describe('scorePerTaskType', () => {
	it('groups by task type and ranks each independently', () => {
		const out = scorePerTaskType([
			{ attempt: attempt('cheap', 1, 0.02, true), taskType: 'implement' },
			{
				attempt: attempt('quality', 4, 0.1, true),
				taskType: 'implement',
			},
			{ attempt: attempt('cheap', 1, 0.05, false), taskType: 'review' },
			{ attempt: attempt('quality', 4, 0.02, true), taskType: 'review' },
		]);
		expect(out.implement?.winner).toBe('cheap');
		expect(out.review?.winner).toBe('quality');
	});

	it('uses _default when no task type is supplied', () => {
		const out = scorePerTaskType([
			{ attempt: attempt('only', 1, 0.02, true) },
		]);
		expect(out._default?.winner).toBe('only');
	});
});
