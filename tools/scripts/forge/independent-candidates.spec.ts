/**
 * independent-candidates.spec.ts — candidates that touch nothing in
 * common land without being brought forward (f00755).
 */
import {
	acceptIndependent,
	acceptRiders,
	isReviewBatch,
	overlapBetween,
	type IChangeFootprint,
	type IQueueCandidateChange,
} from '@delendai/core/cli';
import { describe, expect, it } from 'vitest';

const touch = (
	zones: readonly string[] | 'everything',
	files: readonly string[] = [],
): IChangeFootprint => ({
	zones: zones === 'everything' ? 'everything' : new Set(zones),
	files: new Set(files),
});

const candidate = (
	number: number,
	own: IChangeFootprint,
	integration: IChangeFootprint,
	level = false,
): IQueueCandidateChange => ({
	number,
	headRef: `delendai/pr/a/implement/x${String(number)}-S1-g1/t`,
	level,
	own,
	integration,
});

describe('overlapBetween', () => {
	it('[<50ms] finds a zone or a file in common, and anything against everything', () => {
		expect(
			overlapBetween(touch(['core']), touch(['core', 'tools'])),
		).toContain('core');
		expect(
			overlapBetween(
				touch([], ['docs/a.md']),
				touch(['apps'], ['docs/a.md']),
			),
		).toContain('docs/a.md');
		expect(overlapBetween(touch('everything'), touch(['apps']))).toContain(
			'every zone',
		);
	});

	it('[<50ms] finds none between disjoint changes, or against an empty one', () => {
		expect(
			overlapBetween(
				touch(['core'], ['a.ts']),
				touch(['tools'], ['b.ts']),
			),
		).toBeUndefined();
		expect(overlapBetween(touch('everything'), touch([]))).toBeUndefined();
	});
});

/** A change that reaches `zones` only because their specs read its files. */
const read = (
	zones: readonly string[],
	files: readonly string[],
	creates = false,
	code: readonly string[] = [],
): IChangeFootprint => ({
	zones: new Set([...zones, ...code]),
	files: new Set(files),
	readOnly: new Set(zones),
	creates,
});

describe('a zone two changes only feed with files', () => {
	const packA = read(['proposals'], ['docs/proposals/review/x00001-a.md']);
	const packB = read(['proposals'], ['docs/proposals/done/x00002-b.md']);

	it('[<50ms] keeps two verdicts on two proposals apart', () => {
		expect(overlapBetween(packA, packB)).toBeUndefined();
	});

	it('[<50ms] still joins them on one document', () => {
		expect(
			overlapBetween(
				packA,
				read(['proposals'], ['docs/proposals/review/x00001-a.md']),
			),
		).toContain('x00001-a.md');
	});

	it('[<50ms] still joins two changes that each add a new file there', () => {
		// How two documents come to carry one number: nothing in either
		// change alone says so.
		expect(
			overlapBetween(
				read(['proposals'], ['docs/proposals/ready/x00009-a.md'], true),
				read(['proposals'], ['docs/proposals/ready/x00009-b.md'], true),
			),
		).toContain('new files read by the proposals zone');
	});

	it("[<50ms] still joins a change to the zone's code with one that feeds it", () => {
		expect(
			overlapBetween(
				packA,
				touch(['proposals'], ['plugins/proposals/src/lint.ts']),
			),
		).toContain('proposals');
	});

	it('[<50ms] lets a verdict land beside a change of code that only edits its own document', () => {
		const implement = read(
			['proposals'],
			['packages/core/src/a.ts', 'docs/proposals/review/x00003-c.md'],
			true,
			['core'],
		);
		expect(overlapBetween(implement, packA)).toBeUndefined();
		const verdicts = acceptIndependent([
			candidate(1, implement, touch([]), true),
			candidate(2, packA, touch([])),
			candidate(3, packB, packA),
		]);
		expect(verdicts.map((verdict) => verdict.accepted)).toEqual([
			true,
			true,
			true,
		]);
	});

	it('[<50ms] keeps a pure review batch off a code change in the zones it only feeds', () => {
		// The batch reaches core, plugins, proposals and tools only because
		// a few specs there read proposals: those specs are all it reaches.
		const batch: IChangeFootprint = {
			...read(
				['core', 'plugins', 'proposals', 'tools'],
				['docs/delendai/proposals/review/x01001-a.md'],
			),
			readers: new Set(['plugins/proposals/tests/lint.spec.ts']),
		};
		expect(
			overlapBetween(
				batch,
				touch(['core', 'tools'], ['packages/core/src/a.ts']),
			),
		).toBeUndefined();
		expect(
			acceptIndependent([
				candidate(1, batch, touch([]), true),
				candidate(
					2,
					touch(['core'], ['packages/core/src/a.ts']),
					touch([]),
					true,
				),
			]).map((verdict) => verdict.accepted),
		).toEqual([true, true]);
		// Unless the code change edits one of the specs that read it.
		expect(
			overlapBetween(
				batch,
				touch(['proposals'], ['plugins/proposals/tests/lint.spec.ts']),
			),
		).toContain('proposals');
	});

	it('[<50ms] reads a footprint that does not say how it reaches a zone as code', () => {
		expect(
			overlapBetween(packA, touch(['proposals'], ['docs/other.md'])),
		).toContain('proposals');
	});
});

describe('acceptIndependent', () => {
	it('[<50ms] lands four candidates that touch nothing in common, level or not', () => {
		const verdicts = acceptIndependent([
			candidate(
				1,
				touch(['core'], ['packages/core/a.ts']),
				touch([]),
				true,
			),
			candidate(
				2,
				touch(['tools'], ['tools/b.ts']),
				touch(['core'], ['packages/core/a.ts']),
			),
			candidate(
				3,
				touch(['apps'], ['apps/c.ts']),
				touch(['core'], ['packages/core/a.ts']),
			),
			candidate(
				4,
				touch(['proposals'], ['docs/p.md']),
				touch(['core'], ['packages/core/a.ts']),
			),
		]);
		expect(verdicts.map((v) => v.accepted)).toEqual([
			true,
			true,
			true,
			true,
		]);
		expect(verdicts[1]?.why).toContain(
			'nothing the integration branch gained',
		);
	});

	it('[<50ms] brings forward a candidate the integration branch changed under it', () => {
		const [verdict] = acceptIndependent([
			candidate(
				5,
				touch(['core'], ['packages/core/x.ts']),
				touch(['core'], ['packages/core/y.ts']),
			),
		]);
		expect(verdict).toMatchObject({ accepted: false });
		expect(verdict?.why).toContain('core');
	});

	it('[<50ms] holds a candidate that overlaps one accepted before it, even a level one', () => {
		const verdicts = acceptIndependent([
			candidate(6, touch(['tools'], ['tools/a.ts']), touch([])),
			candidate(7, touch(['tools'], ['tools/b.ts']), touch([]), true),
			candidate(8, touch(['apps'], ['apps/c.ts']), touch([])),
		]);
		expect(verdicts.map((v) => v.accepted)).toEqual([true, false, true]);
		expect(verdicts[1]?.why).toContain('#6');
	});

	it('[<50ms] never lands a change that can reach everything beside another', () => {
		const verdicts = acceptIndependent([
			candidate(
				9,
				touch('everything', ['package.json']),
				touch(['core'], ['x.ts']),
			),
			candidate(10, touch('everything', ['bun.lock']), touch([]), true),
			candidate(11, touch(['apps'], ['apps/a.ts']), touch([])),
		]);
		expect(verdicts.map((v) => v.accepted)).toEqual([false, true, false]);
	});
});

describe('acceptRiders: who rides the next train', () => {
	it('[<50ms] takes a candidate behind on a change that can reach every zone', () => {
		const verdicts = acceptRiders([
			candidate(3, touch(['core'], ['a.ts']), touch('everything')),
			candidate(5, touch(['tools'], ['b.ts']), touch('everything')),
		]);
		expect(verdicts.map((v) => v.accepted)).toEqual([true, true]);
		expect(verdicts[0]?.why).toContain('the train proves it');
		// The queue's own verdict still brings it forward: the train does not.
		expect(
			acceptIndependent([
				candidate(3, touch(['core'], ['a.ts']), touch('everything')),
			])[0]?.accepted,
		).toBe(false);
	});

	it('[<50ms] splits no riders for a zone or a file in common: the train runs the combination', () => {
		// #1832 waited for the next train because it and #1802 both
		// touched the core, plugins, proposals and tools zones.
		const verdicts = acceptRiders([
			candidate(1802, touch(['core', 'tools'], ['a.ts']), touch([])),
			candidate(
				1832,
				touch(['core', 'tools'], ['a.ts', 'b.ts']),
				touch([]),
			),
			candidate(5, touch('everything', ['bun.lock']), touch([])),
		]);
		expect(verdicts.map((v) => [v.number, v.accepted])).toEqual([
			[1802, true],
			[1832, true],
			[5, true],
		]);
	});

	it('[<50ms] keeps zone overlap for a candidate that lands without a run', () => {
		const verdicts = acceptIndependent([
			candidate(1802, touch(['core'], ['a.ts']), touch([]), true),
			candidate(1832, touch(['core'], ['b.ts']), touch([]), true),
		]);
		expect(verdicts.map((v) => v.accepted)).toEqual([true, false]);
		expect(verdicts[1]?.why).toContain('#1802, which lands first');
	});

	it('[<50ms] lets a review batch that only reads the reader zones ride beside a code pull request', () => {
		const batch: IQueueCandidateChange = {
			...candidate(
				9,
				{
					zones: new Set(['proposals', 'core']),
					files: new Set(['docs/proposals/review/x00001-a.md']),
					readOnly: new Set(['proposals', 'core']),
				},
				touch([]),
			),
			headRef: 'delendai/pr/glm-5.3-max/review/batch-all-g4/verdicts',
		};
		const code = candidate(
			4,
			touch(['core'], ['packages/core/a.ts']),
			touch([]),
		);
		const verdicts = acceptRiders([batch, code]);
		expect(verdicts.map((v) => [v.number, v.accepted])).toEqual([
			[4, true],
			[9, true],
		]);
		expect(isReviewBatch(batch.headRef)).toBe(true);
		expect(isReviewBatch(code.headRef)).toBe(false);
	});

	it('[<50ms] leads the train with an urgent repair, ahead of review batches', () => {
		const verdicts = acceptRiders(
			[
				{
					...candidate(2, touch(['proposals']), touch([])),
					headRef: 'delendai/pr/a/review/batch-all-g1/v',
				},
				candidate(3, touch(['core']), touch([])),
				candidate(7, touch(['core']), touch([])),
			],
			(each) =>
				each.number === 7
					? 'urgent'
					: isReviewBatch(each.headRef)
						? 'review'
						: 'normal',
		);
		expect(verdicts.map((v) => v.number)).toEqual([7, 3, 2]);
		expect(verdicts[0]?.why).toContain('urgent repair');
	});
});
