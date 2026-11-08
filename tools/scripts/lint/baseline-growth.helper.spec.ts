/**
 * The guard that decides whether `--update` may write a bigger baseline.
 *
 * c00529's acceptance asks every ratchet script to fail when the
 * versioned baseline GROWS, not only when a new file appears above it,
 * and to require an explicit flag plus a reason before accepting debt.
 * Three of the five scripts had no such check: `--update` would have
 * written a larger baseline without a word, which turns any of these
 * gates into a one-command opt-out.
 */
import { describe, expect, it } from 'vitest';

import {
	countBaselineGrowth,
	readReasonFlag,
	refuseBaselineGrowth,
	setBaselineGrowth,
} from './baseline-growth.helper';

describe('countBaselineGrowth', () => {
	it('reports a file whose count rose, with both numbers', () => {
		expect(countBaselineGrowth({ 'a.ts': 3 }, { 'a.ts': 1 })).toEqual([
			'a.ts: 1 -> 3',
		]);
	});

	it('reports a file that is not in the baseline at all', () => {
		expect(countBaselineGrowth({ 'new.ts': 1 }, {})).toEqual([
			'new.ts: 0 -> 1',
		]);
	});

	it('is silent when a count shrinks or holds — that is the point', () => {
		expect(
			countBaselineGrowth(
				{ 'a.ts': 1, 'b.ts': 2 },
				{ 'a.ts': 5, 'b.ts': 2 },
			),
		).toEqual([]);
	});

	it('does not treat a REMOVED file as growth', () => {
		expect(countBaselineGrowth({}, { 'gone.ts': 4 })).toEqual([]);
	});
});

describe('setBaselineGrowth', () => {
	it('reports only entries absent from the baseline', () => {
		expect(setBaselineGrowth(['a', 'b'], new Set(['a']))).toEqual(['b']);
	});

	it('is silent when the set only shrinks', () => {
		expect(setBaselineGrowth(['a'], new Set(['a', 'b']))).toEqual([]);
	});
});

describe('readReasonFlag', () => {
	it('reads --reason=x and --reason x alike', () => {
		expect(readReasonFlag(['--reason=why'])).toBe('why');
		expect(readReasonFlag(['--reason', 'why'])).toBe('why');
		expect(readReasonFlag(['--update'])).toBeUndefined();
	});
});

describe('refuseBaselineGrowth', () => {
	const growth = ['a.ts: 0 -> 1'];

	it('allows a write when nothing grew', () => {
		expect(
			refuseBaselineGrowth({ gate: 'g', growth: [], argv: ['--update'] }),
		).toBeUndefined();
	});

	it('refuses growth with no flag at all', () => {
		expect(
			refuseBaselineGrowth({ gate: 'g', growth, argv: ['--update'] }),
		).toContain('would grow the baseline');
	});

	it('refuses the flag WITHOUT a reason — half an exception is none', () => {
		expect(
			refuseBaselineGrowth({
				gate: 'g',
				growth,
				argv: ['--update', '--allow-baseline-growth'],
			}),
		).toContain('--allow-baseline-growth');
	});

	it('refuses a blank reason', () => {
		expect(
			refuseBaselineGrowth({
				gate: 'g',
				growth,
				argv: ['--allow-baseline-growth', '--reason=   '],
			}),
		).toBeDefined();
	});

	it('allows growth with both the flag and a real reason', () => {
		expect(
			refuseBaselineGrowth({
				gate: 'g',
				growth,
				argv: ['--allow-baseline-growth', '--reason=migrating x00123'],
			}),
		).toBeUndefined();
	});

	it('names the flag the caller actually used', () => {
		expect(
			refuseBaselineGrowth({
				gate: 'file-conventions',
				growth,
				argv: [],
				updateFlag: '--write-baseline',
			}),
		).toContain('--write-baseline');
	});

	it('lists every offending entry so the debt is visible', () => {
		const message = refuseBaselineGrowth({
			gate: 'g',
			growth: ['a.ts: 0 -> 1', 'b.ts: 2 -> 5'],
			argv: [],
		});
		expect(message).toContain('a.ts: 0 -> 1');
		expect(message).toContain('b.ts: 2 -> 5');
		expect(message).toContain('2 entries');
	});
});
