import { describe, expect, it } from 'vitest';

import {
	formatCost,
	formatWeekly,
	kpiBreaches,
	jobCost,
	percentile,
	redHoursByWeek,
	summarize,
	weeklyCost,
	weekOf,
} from './pr-ci-cost.script';

const step = (start: string, end: string) => ({
	started_at: `2026-11-02T10:${start}Z`,
	completed_at: `2026-11-02T10:${end}Z`,
});

describe('pr-ci-cost', () => {
	it('[<50ms] measures a job from its first step start to its last step end', () => {
		const cost = jobCost({
			name: 'a',
			steps: [step('00:00', '00:10'), step('00:10', '01:00')],
		});
		expect(cost?.seconds).toBe(60);
	});

	it('[<50ms] ignores steps without times and jobs that ran nothing', () => {
		const skipped = { started_at: null, completed_at: null };
		expect(jobCost({ name: 'a', steps: [skipped] })).toBeUndefined();
		expect(summarize([{ name: 'a', steps: [skipped] }]).jobs).toBe(0);
	});

	it('[<50ms] sums runner seconds, spans wall time and keeps the five slowest', () => {
		const jobs = [10, 20, 30, 40, 50, 60].map((s, i) => ({
			name: `j${i}`,
			steps: [
				step(
					'00:00',
					`0${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
				),
			],
		}));
		const cost = summarize(jobs);
		expect(cost.jobs).toBe(6);
		expect(cost.runnerSeconds).toBe(210);
		expect(cost.wallSeconds).toBe(60);
		expect(cost.slowest.map((each) => each.name)).toEqual([
			'j5',
			'j4',
			'j3',
			'j2',
			'j1',
		]);
		expect(formatCost('7', cost).split('\n')[0]).toBe(
			'#7: 6 jobs, 210 runner-seconds, 60 s wall',
		);
	});

	it('[<50ms] takes nearest-rank percentiles and weeks starting on Monday', () => {
		expect(percentile([], 90)).toBe(0);
		expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
		expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
		expect(weekOf(Date.parse('2026-11-08T23:00:00Z'))).toBe('2026-11-02');
		expect(weekOf(Date.parse('2026-11-09T00:00:00Z'))).toBe('2026-11-09');
	});

	it('[<50ms] counts red hours from a failure to the next green, across weeks', () => {
		const red = redHoursByWeek(
			[
				{ createdAt: '2026-11-08T22:00:00Z', conclusion: 'failure' },
				{ createdAt: '2026-11-09T02:00:00Z', conclusion: 'success' },
				{ createdAt: '2026-11-10T00:00:00Z', conclusion: 'failure' },
			],
			Date.parse('2026-11-10T03:00:00Z'),
		);
		expect(red.get('2026-11-02')).toBe(2);
		expect(red.get('2026-11-09')).toBe(5);
	});

	it('[<50ms] reports a week: p50/p90, runs per PR and the top failure causes', () => {
		const pr = (number: number, hours: number) => ({
			number,
			createdAt: '2026-11-10T00:00:00Z',
			readyAt: '2026-11-10T00:00:00Z',
			mergedAt: new Date(
				Date.parse('2026-11-10T00:00:00Z') + hours * 3_600_000,
			).toISOString(),
			mergedBy: 'land[bot]',
		});
		const run = (n: number, failedJobs: string[]) => ({
			pr: n,
			startedAt: '2026-11-10T00:00:00Z',
			endedAt: '2026-11-10T00:05:00Z',
			conclusion: failedJobs.length === 0 ? 'success' : 'failure',
			failedJobs,
		});
		const [row] = weeklyCost({
			prs: [pr(1, 1), pr(2, 2), pr(3, 3), pr(4, 10)],
			prRuns: [
				run(1, ['lint']),
				run(1, []),
				run(2, ['lint']),
				run(3, ['unit']),
			],
			developRuns: [],
			commitLog: '',
			nowMs: Date.parse('2026-11-12T00:00:00Z'),
		});
		expect(row?.merged).toBe(4);
		expect(row?.openToMergeP50Hours).toBe(2);
		expect(row?.openToMergeP90Hours).toBe(10);
		expect(row?.runsPerPr).toBe(1);
		expect(row?.topFailures).toEqual([
			{ name: 'lint', count: 2 },
			{ name: 'unit', count: 1 },
		]);
		expect(formatWeekly(row === undefined ? [] : [row])).toContain(
			'p90 10 h',
		);
	});

	it('[<50ms] names each KPI over its threshold with the number', () => {
		const at = (minutes: number) =>
			new Date(
				Date.parse('2026-11-10T00:00:00Z') + minutes * 60_000,
			).toISOString();
		const pr = (
			number: number,
			mergedBy: string,
			readyMin: number,
			mergedMin: number,
		) => ({
			number,
			createdAt: at(0),
			readyAt: at(readyMin),
			mergedAt: at(mergedMin),
			mergedBy,
		});
		const [row] = weeklyCost({
			prs: [pr(1, 'land[bot]', 0, 10), pr(2, 'someone', 0, 120)],
			prRuns: [
				{
					pr: 1,
					startedAt: at(0),
					endedAt: at(9),
					conclusion: 'success',
					failedJobs: [],
				},
				{
					pr: 2,
					startedAt: at(0),
					endedAt: at(5),
					conclusion: 'success',
					failedJobs: [],
				},
			],
			developRuns: [],
			commitLog: [
				'2026-11-10T01:00:00Z\tp1\tfeat: a',
				'2026-11-10T02:00:00Z\tp1\tchore(generated): refresh',
				'2026-11-10T03:00:00Z\tp1\tfeat: b',
			].join('\n'),
			nowMs: Date.parse('2026-11-12T00:00:00Z'),
		});
		expect(row?.humanMerges).toBe(1);
		expect(row?.unexplainedWaits).toBe(1);
		expect(row?.bookkeepingShare).toBe(0.333);
		expect(row?.readyToMergedP50Minutes).toBe(10);
		const names = kpiBreaches(row ?? ({} as never)).map((b) => b.name);
		expect(names).toEqual([
			'human merges',
			'unexplained waits over 30 minutes',
			'bookkeeping commit share',
		]);
		expect(formatWeekly(row === undefined ? [] : [row])).toContain(
			'OVER THRESHOLD: human merges = 1 (limit 0)',
		);
	});
});
