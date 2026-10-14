/**
 * independent-candidates.spec.ts — candidates that touch nothing in
 * common land without being brought forward (f00755).
 */
import { describe, expect, it } from 'vitest';

import { acceptIndependent, overlapBetween } from './independent-candidates';
import type {
	IChangeFootprint,
	IQueueCandidateChange,
} from './independent-candidates.interface';

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
	it('finds a zone or a file in common, and anything against everything', () => {
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

	it('finds none between disjoint changes, or against an empty one', () => {
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

	it('keeps two verdicts on two proposals apart', () => {
		expect(overlapBetween(packA, packB)).toBeUndefined();
	});

	it('still joins them on one document', () => {
		expect(
			overlapBetween(
				packA,
				read(['proposals'], ['docs/proposals/review/x00001-a.md']),
			),
		).toContain('x00001-a.md');
	});

	it('still joins two changes that each add a new file there', () => {
		// How two documents come to carry one number: nothing in either
		// change alone says so.
		expect(
			overlapBetween(
				read(['proposals'], ['docs/proposals/ready/x00009-a.md'], true),
				read(['proposals'], ['docs/proposals/ready/x00009-b.md'], true),
			),
		).toContain('new files read by the proposals zone');
	});

	it("still joins a change to the zone's code with one that feeds it", () => {
		expect(
			overlapBetween(
				packA,
				touch(['proposals'], ['plugins/proposals/src/lint.ts']),
			),
		).toContain('proposals');
	});

	it('lets a verdict land beside a change of code that only edits its own document', () => {
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

	it('reads a footprint that does not say how it reaches a zone as code', () => {
		expect(
			overlapBetween(packA, touch(['proposals'], ['docs/other.md'])),
		).toContain('proposals');
	});
});

describe('acceptIndependent', () => {
	it('lands four candidates that touch nothing in common, level or not', () => {
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

	it('brings forward a candidate the integration branch changed under it', () => {
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

	it('holds a candidate that overlaps one accepted before it, even a level one', () => {
		const verdicts = acceptIndependent([
			candidate(6, touch(['tools'], ['tools/a.ts']), touch([])),
			candidate(7, touch(['tools'], ['tools/b.ts']), touch([]), true),
			candidate(8, touch(['apps'], ['apps/c.ts']), touch([])),
		]);
		expect(verdicts.map((v) => v.accepted)).toEqual([true, false, true]);
		expect(verdicts[1]?.why).toContain('#6');
	});

	it('never lands a change that can reach everything beside another', () => {
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
