import { describe, expect, it } from 'vitest';

import {
	classifyFullyTracked,
	collectPendingSlices,
} from '../../scripts/lint/proposal-already-implemented.script';

/**
 * This lint reported nothing for as long as it existed. `FILES_BLOCK_RE`
 * carried a `g` flag, and `String.prototype.match` with a global regex
 * returns the whole matches and drops the capture groups — so reading
 * `[1]` yielded the SECOND Files block, which is `undefined` for the
 * one-block shape every slice actually uses. Every slice parsed as zero
 * files and was skipped by the `files.length === 0` guard.
 *
 * The cost was not theoretical: 78 slices across the open proposals
 * declare files that are already tracked, and agents kept being sent to
 * re-implement work that had already landed.
 */
describe('proposal-already-implemented — slice parsing', () => {
	const slice = (body: string): string =>
		['# x00001 — fixture', '', '## Slices', '', body, ''].join('\n');

	it('reads the files of a slice with a single Files block', () => {
		const parsed = collectPendingSlices(
			slice(
				[
					'### S1 — do the thing',
					'',
					'- **Status**: pending',
					'- **Files**: `packages/core/src/a.ts`, `packages/core/src/b.ts`',
					'- **Gate**: type',
				].join('\n'),
			),
		);

		expect(parsed).toHaveLength(1);
		expect(parsed[0]?.sliceId).toBe('S1');
		expect(parsed[0]?.files).toEqual([
			'packages/core/src/a.ts',
			'packages/core/src/b.ts',
		]);
	});

	it('never returns a pending slice with an empty file list when files are declared', () => {
		// The exact regression: a non-empty Files block must not parse
		// as zero files, because the caller skips those slices outright.
		const parsed = collectPendingSlices(
			slice(
				[
					'### S7 — one declared file',
					'',
					'- **Status**: pending',
					'- **Files**: `plugins/commit-policy/src/lib/services/commit-driver.ts`',
					'- **Gate**: lint, types, test',
				].join('\n'),
			),
		);

		expect(parsed[0]?.files).not.toEqual([]);
	});

	it('reads several slices independently', () => {
		const parsed = collectPendingSlices(
			slice(
				[
					'### S1 — first',
					'',
					'- **Status**: pending',
					'- **Files**: `packages/core/src/a.ts`',
					'',
					'### S2 — second',
					'',
					'- **Status**: pending',
					'- **Files**: `packages/core/src/b.ts`',
				].join('\n'),
			),
		);

		expect(parsed.map((s) => s.files)).toEqual([
			['packages/core/src/a.ts'],
			['packages/core/src/b.ts'],
		]);
	});

	it('skips slices that are not pending', () => {
		const parsed = collectPendingSlices(
			slice(
				[
					'### S1 — already closed',
					'',
					'- **Status**: done',
					'- **Files**: `packages/core/src/a.ts`',
				].join('\n'),
			),
		);

		expect(parsed).toEqual([]);
	});

	it('drops globs and placeholders, which name no single tracked file', () => {
		const parsed = collectPendingSlices(
			slice(
				[
					'### S1 — broad scope',
					'',
					'- **Status**: pending',
					'- **Files**: `packages/**/tests/**`, `packages/core/src/a.ts`, `<generated>`',
				].join('\n'),
			),
		);

		expect(parsed[0]?.files).toEqual(['packages/core/src/a.ts']);
	});
});

/**
 * A tracked file is only evidence that a slice is done if the slice
 * created it. Measured on 2026-09-14: of 29 pending slices whose files
 * were all present, 20 named files that predated their own proposal, and
 * every one of them was being told to close.
 */
describe('proposal-already-implemented — created versus modified', () => {
	const origin = (sha: string, iso: string) => ({
		sha,
		iso,
		date: iso.slice(0, 10),
	});

	it('does not treat a file that predates the proposal as evidence', () => {
		// v00137's shape: a September perf proposal naming files from June.
		expect(
			classifyFullyTracked('2026-09-10', [
				{
					file: 'packages/cli/src/commands/init/init.command.ts',
					origin: origin('aaa', '2026-06-29T10:00:00Z'),
				},
			]),
		).toEqual({
			kind: 'modifies-existing',
			preExisting: ['packages/cli/src/commands/init/init.command.ts'],
		});
	});

	it('names every pre-existing file, even when others are new', () => {
		expect(
			classifyFullyTracked('2026-09-07', [
				{ file: 'old.ts', origin: origin('a', '2026-08-01T00:00:00Z') },
				{ file: 'new.ts', origin: origin('b', '2026-09-08T00:00:00Z') },
			]),
		).toEqual({ kind: 'modifies-existing', preExisting: ['old.ts'] });
	});

	it('offers the creating commits as evidence when the slice made every file', () => {
		expect(
			classifyFullyTracked('2026-09-07', [
				{
					file: 'b.ts',
					origin: origin('second', '2026-09-09T00:00:00Z'),
				},
				{
					file: 'a.ts',
					origin: origin('first', '2026-09-07T12:00:00Z'),
				},
				{
					file: 'c.ts',
					origin: origin('first', '2026-09-07T12:00:00Z'),
				},
			]),
		).toEqual({
			kind: 'files-already-tracked',
			evidence: ['first', 'second'],
		});
	});

	it('counts a file created ON the proposal date as created by it', () => {
		// Proposals are routinely written and started the same day.
		expect(
			classifyFullyTracked('2026-09-06', [
				{ file: 'a.ts', origin: origin('x', '2026-09-06T23:00:00Z') },
			]).kind,
		).toBe('files-already-tracked');
	});

	it('keeps the previous classification when the proposal has no date', () => {
		// Nothing can be proven either way; hiding the finding would be
		// the quieter failure.
		expect(
			classifyFullyTracked(undefined, [
				{ file: 'a.ts', origin: origin('x', '2020-01-01T00:00:00Z') },
			]).kind,
		).toBe('files-already-tracked');
	});
});
