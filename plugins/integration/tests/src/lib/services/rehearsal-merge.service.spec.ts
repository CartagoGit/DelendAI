import { describe, expect, it } from 'vitest';

import type {
	IRehearsalReport,
	IRehearsalSamples,
	IRehearsalScenario,
} from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import { fakePartial } from '@delendai/test-kit';
import type { IGroupPlan } from '../../../../src/lib/contracts/interfaces/rehearsal-groups.interface';
import { mergeGroupReports } from '../../../../src/lib/services/rehearsal-merge.service';

const scenario = (id: string): IRehearsalScenario =>
	fakePartial<IRehearsalScenario>({ id, title: id });

const samples = (over: Partial<IRehearsalSamples> = {}): IRehearsalSamples => ({
	mergeMinutes: [3],
	expectedMerged: 1,
	manualSteps: 0,
	notifiedSeconds: [],
	caughtUp: true,
	tips: 1,
	scanned: 1,
	groupChecks: [{ ok: true, detail: 'one CI' }],
	...over,
});

const plans: readonly IGroupPlan[] = [
	{ n: 1, total: 2, scenarios: [scenario('a'), scenario('b')] },
	{ n: 2, total: 2, scenarios: [scenario('c')] },
];

const report = (
	ids: readonly string[],
	over: Partial<IRehearsalReport> = {},
): IRehearsalReport => ({
	runId: `run-${ids.join('')}`,
	mode: 'fast',
	repository: 'o/r',
	tip: 'tip1',
	startedAt: '2026-01-01T00:00:10.000Z',
	finishedAt: '2026-01-01T00:20:00.000Z',
	scenarios: ids.map((id) => ({
		id,
		title: id,
		ok: true,
		expectations: [],
		integration: 'i',
		pulls: {},
	})),
	targets: [],
	samples: samples(),
	leftovers: [],
	secretHits: [],
	ok: true,
	...over,
});

const merge = (reports: Parameters<typeof mergeGroupReports>[0]['reports']) =>
	mergeGroupReports({ mode: 'fast', groups: plans, reports });

describe('the merge of the groups reports', () => {
	it('[<20ms] makes one green report holding every scenario when all groups are present and green', () => {
		const merged = merge([
			{ report: report(['a', 'b']) },
			{ report: report(['c']) },
		]);
		expect(merged.scenarios.map((one) => one.id)).toEqual(['a', 'b', 'c']);
		expect(merged.ok).toBe(true);
		expect(merged.tip).toBe('tip1');
	});

	it('[<20ms] is red and names the group whose report is missing, with its scenarios red', () => {
		const merged = merge([
			{ report: report(['a', 'b']) },
			{ missing: 'no artifact' },
		]);
		expect(merged.ok).toBe(false);
		const c = merged.scenarios.find((one) => one.id === 'c');
		expect(c?.ok).toBe(false);
		expect(c?.expectations[0]?.detail).toContain(
			'group 2/2 report is missing',
		);
	});

	it('[<20ms] is red when one scenario is red', () => {
		const red = report(['a', 'b']);
		const first = red.scenarios[0];
		if (first === undefined) throw new Error('no scenario');
		const merged = merge([
			{
				report: {
					...red,
					scenarios: [
						{ ...first, ok: false },
						...red.scenarios.slice(1),
					],
				},
			},
			{ report: report(['c']) },
		]);
		expect(merged.ok).toBe(false);
	});

	it('[<20ms] is red when a group played another commit', () => {
		const merged = merge([
			{ report: report(['a', 'b']) },
			{ report: report(['c'], { tip: 'tip2' }) },
		]);
		expect(merged.ok).toBe(false);
		expect(
			merged.scenarios.find((one) => one.id === 'c')?.expectations[0]
				?.detail,
		).toContain('not for tip1');
	});

	it('[<20ms] is red when a report carries no samples', () => {
		const { samples: _none, ...bare } = report(['c']);
		const merged = merge([
			{ report: report(['a', 'b']) },
			{ report: bare },
		]);
		expect(merged.ok).toBe(false);
	});

	it('[<20ms] recomputes p50 and p95 over the pull requests of all groups', () => {
		const merged = merge([
			{
				report: report(['a', 'b'], {
					samples: samples({
						mergeMinutes: [2, 4],
						expectedMerged: 2,
					}),
				}),
			},
			{
				report: report(['c'], {
					samples: samples({
						mergeMinutes: [6, 40],
						expectedMerged: 2,
					}),
				}),
			},
		]);
		const value = (id: string) =>
			merged.targets.find((one) => one.id === id)?.value;
		expect(value('pr-to-merged-p50')).toBe(4);
		expect(value('pr-to-merged-p95')).toBe(40);
		expect(merged.ok).toBe(false);
	});

	it('[<20ms] sums the manual steps and unions the secret hits and leftovers', () => {
		const merged = merge([
			{
				report: report(['a', 'b'], {
					samples: samples({ manualSteps: 1 }),
					secretHits: ['x'],
				}),
			},
			{
				report: report(['c'], {
					samples: samples({ manualSteps: 2 }),
					leftovers: ['branch y'],
				}),
			},
		]);
		expect(
			merged.targets.find((one) => one.id === 'zero-manual-steps')?.value,
		).toBe(3);
		expect(merged.secretHits).toEqual(['x']);
		expect(merged.leftovers).toEqual(['branch y']);
	});
});
