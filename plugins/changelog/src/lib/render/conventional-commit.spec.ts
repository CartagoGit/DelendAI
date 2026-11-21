/**
 * conventional-commit.spec.ts — one log line becomes a typed commit, and
 * a hostile line costs no more than a friendly one.
 */
import { describe, expect, it } from 'vitest';

import { parseConventionalCommit } from './conventional-commit';

describe('parseConventionalCommit', () => {
	it('reads the type, scope and subject of a conventional line', () => {
		expect(
			parseConventionalCommit('abc1234 feat(core): add a thing'),
		).toEqual(
			expect.objectContaining({
				hash: 'abc1234',
				type: 'feat',
				scope: 'core',
				subject: 'add a thing',
				breaking: false,
			}),
		);
	});

	it('marks a bang or a BREAKING CHANGE footer as breaking', () => {
		expect(
			parseConventionalCommit('abc1234 fix!: drop a flag')?.breaking,
		).toBe(true);
		expect(
			parseConventionalCommit(
				'abc1234 fix: drop a flag\n\nBREAKING CHANGE: the flag is gone',
			)?.breaking,
		).toBe(true);
	});

	it('keeps a line that follows no convention, as other', () => {
		expect(parseConventionalCommit('abc1234 Tidy things up')).toEqual(
			expect.objectContaining({
				type: 'other',
				subject: 'Tidy things up',
			}),
		);
	});

	it('answers nothing for a line without a hash, or an empty one', () => {
		expect(parseConventionalCommit('feat: no hash here')).toBeNull();
		expect(parseConventionalCommit('   ')).toBeNull();
	});

	it('reads a line of many tabs in linear time', () => {
		// The whitespace run and the subject could both claim the tabs:
		// quadratic on input a caller does not control.
		const tabs = '\t'.repeat(200_000);
		const started = performance.now();
		parseConventionalCommit(`abc1234${tabs}`);
		parseConventionalCommit(`abc1234 ci:${tabs}`);
		expect(performance.now() - started).toBeLessThan(1_000);
	});
});
