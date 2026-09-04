import { describe, expect, it } from 'vitest';

import { collectPendingSlices } from '../../scripts/lint/proposal-already-implemented.script';

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
