import { describe, expect, it } from 'vitest';

import { formatCost, jobCost, summarize } from './pr-ci-cost.script';

const step = (start: string, end: string) => ({
	started_at: `2026-11-02T10:${start}Z`,
	completed_at: `2026-11-02T10:${end}Z`,
});

describe('pr-ci-cost', () => {
	it('measures a job from its first step start to its last step end', () => {
		const cost = jobCost({
			name: 'a',
			steps: [step('00:00', '00:10'), step('00:10', '01:00')],
		});
		expect(cost?.seconds).toBe(60);
	});

	it('ignores steps without times and jobs that ran nothing', () => {
		const skipped = { started_at: null, completed_at: null };
		expect(jobCost({ name: 'a', steps: [skipped] })).toBeUndefined();
		expect(summarize([{ name: 'a', steps: [skipped] }]).jobs).toBe(0);
	});

	it('sums runner seconds, spans wall time and keeps the five slowest', () => {
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
});
