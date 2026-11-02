/**
 * spec-timings.spec.ts — a zone's specs are split into shards of about
 * equal time, every spec exactly once.
 */
import { describe, expect, it } from 'vitest';

import { balanceByTime, timingsFromJsonReport } from './spec-timings';

describe('timingsFromJsonReport', () => {
	it('reads each file duration by its path from the root, sorted', () => {
		expect(
			timingsFromJsonReport(
				{
					testResults: [
						{
							name: '/repo/tools/b.spec.ts',
							startTime: 10,
							endTime: 40,
						},
						{
							name: '/repo/plugins/a.spec.ts',
							startTime: 0,
							endTime: 5.4,
						},
						{ name: '/repo/x.spec.ts' },
					],
				},
				'/repo/',
			),
		).toEqual({ 'plugins/a.spec.ts': 5, 'tools/b.spec.ts': 30 });
		expect(timingsFromJsonReport({}, '/repo')).toEqual({});
	});
});

describe('balanceByTime', () => {
	it('keeps every shard within the longest spec of the mean', () => {
		const timings: Record<string, number> = {};
		const specs: string[] = [];
		for (let index = 0; index < 60; index += 1) {
			const spec = `z/s${String(index).padStart(2, '0')}.spec.ts`;
			specs.push(spec);
			timings[spec] = index % 10 === 0 ? 9000 : 300 + index * 7;
		}
		const lists = balanceByTime(specs, 4, timings);
		expect(lists.flat().sort()).toEqual([...specs].sort());
		const loads = lists.map((list) =>
			list.reduce((sum, spec) => sum + (timings[spec] ?? 0), 0),
		);
		const mean = loads.reduce((a, b) => a + b, 0) / loads.length;
		for (const load of loads) {
			expect(load - mean).toBeLessThanOrEqual(9000);
		}
		expect(Math.max(...loads) - Math.min(...loads)).toBeLessThan(2000);
	});

	it('counts an unmeasured spec as the median, and splits deterministically', () => {
		const lists = balanceByTime(
			['a.spec.ts', 'b.spec.ts', 'c.spec.ts', 'new.spec.ts'],
			2,
			{ 'a.spec.ts': 100, 'b.spec.ts': 10, 'c.spec.ts': 50 },
		);
		// new counts as 50, the median; b ties both shards and takes the lower.
		expect(lists).toEqual([
			['a.spec.ts', 'b.spec.ts'],
			['c.spec.ts', 'new.spec.ts'],
		]);
		expect(balanceByTime(['a.spec.ts'], 0, {})).toEqual([['a.spec.ts']]);
	});
});
