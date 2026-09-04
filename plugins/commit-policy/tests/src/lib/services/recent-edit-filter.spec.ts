/**
 * recent-edit-filter.spec.ts
 *
 * The cases that matter are the ones where withholding would be WRONG: an
 * unmeasurable path, a disabled quiet period, and a file that has been
 * sitting still. A filter that errs toward withholding turns a safety net
 * into a reason work never gets committed at all, which is the failure the
 * sweep exists to prevent.
 */
import { describe, expect, it } from 'vitest';

import {
	DEFAULT_QUIET_PERIOD_MS,
	filterRecentlyEditedFiles,
} from '@delendai/commit-policy/lib/services/recent-edit-filter';

const NOW = 1_700_000_000_000;

/** A reader over a fixed table, so no test touches a real clock or disk. */
const readerFor =
	(
		table: Readonly<Record<string, number | undefined>>,
	): ((file: string) => number | undefined) =>
	(file) =>
		table[file];

describe('filterRecentlyEditedFiles', () => {
	it('withholds a file touched inside the quiet period', async () => {
		const result = await filterRecentlyEditedFiles({
			files: ['a.ts'],
			modifiedAt: readerFor({ 'a.ts': NOW - 5_000 }),
			quietPeriodMs: 60_000,
			now: NOW,
		});
		expect(result.files).toEqual([]);
		expect(result.withheld).toEqual([{ file: 'a.ts', ageMs: 5_000 }]);
	});

	it('keeps a file that has been sitting still', async () => {
		const result = await filterRecentlyEditedFiles({
			files: ['a.ts'],
			modifiedAt: readerFor({ 'a.ts': NOW - 600_000 }),
			quietPeriodMs: 60_000,
			now: NOW,
		});
		expect(result.files).toEqual(['a.ts']);
		expect(result.withheld).toEqual([]);
	});

	it('keeps a file exactly at the boundary', async () => {
		// `>=` and not `>`: a file whose age equals the period has waited
		// the full period, and an off-by-one here would defer it forever
		// on a clock with coarse resolution.
		const result = await filterRecentlyEditedFiles({
			files: ['a.ts'],
			modifiedAt: readerFor({ 'a.ts': NOW - 60_000 }),
			quietPeriodMs: 60_000,
			now: NOW,
		});
		expect(result.files).toEqual(['a.ts']);
	});

	it('keeps a file it cannot measure', async () => {
		// A transient stat failure must not silently shrink a commit.
		// Unmeasurable means "not withheld", never "withheld to be safe".
		const result = await filterRecentlyEditedFiles({
			files: ['gone.ts'],
			modifiedAt: readerFor({}),
			quietPeriodMs: 60_000,
			now: NOW,
		});
		expect(result.files).toEqual(['gone.ts']);
		expect(result.withheld).toEqual([]);
	});

	it('is a no-op when the quiet period is zero', async () => {
		const result = await filterRecentlyEditedFiles({
			files: ['a.ts', 'b.ts'],
			modifiedAt: readerFor({ 'a.ts': NOW, 'b.ts': NOW }),
			quietPeriodMs: 0,
			now: NOW,
		});
		expect(result.files).toEqual(['a.ts', 'b.ts']);
		expect(result.withheld).toEqual([]);
	});

	it('splits a mixed set and preserves order', async () => {
		const result = await filterRecentlyEditedFiles({
			files: ['old.ts', 'fresh.ts', 'older.ts'],
			modifiedAt: readerFor({
				'old.ts': NOW - 120_000,
				'fresh.ts': NOW - 1_000,
				'older.ts': NOW - 900_000,
			}),
			quietPeriodMs: 60_000,
			now: NOW,
		});
		expect(result.files).toEqual(['old.ts', 'older.ts']);
		expect(result.withheld.map((entry) => entry.file)).toEqual([
			'fresh.ts',
		]);
	});

	it('applies its own default when none is configured', async () => {
		const justInside = await filterRecentlyEditedFiles({
			files: ['a.ts'],
			modifiedAt: readerFor({
				'a.ts': NOW - (DEFAULT_QUIET_PERIOD_MS - 1),
			}),
			now: NOW,
		});
		expect(justInside.files).toEqual([]);

		const justOutside = await filterRecentlyEditedFiles({
			files: ['a.ts'],
			modifiedAt: readerFor({ 'a.ts': NOW - DEFAULT_QUIET_PERIOD_MS }),
			now: NOW,
		});
		expect(justOutside.files).toEqual(['a.ts']);
	});

	it('accepts an async reader', async () => {
		const result = await filterRecentlyEditedFiles({
			files: ['a.ts'],
			modifiedAt: async (file) =>
				file === 'a.ts' ? NOW - 1_000 : undefined,
			quietPeriodMs: 60_000,
			now: NOW,
		});
		expect(result.files).toEqual([]);
	});
});
