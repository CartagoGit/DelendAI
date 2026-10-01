/**
 * resolve-scope-prose.spec.ts — reading the proposal style this repo
 * actually uses.
 *
 * Proposals here declare files as a sub-bullet per file, with the path
 * in a code span and an explanation after an em-dash:
 *
 *   - **Files**:
 *     - `packages/core/src/lib/foo.ts` — what this slice does to it
 *
 * The resolver used to classify the whole entry, decide it was
 * `vague-language`, and resolve the slice to zero files — so the slice
 * never committed. Observed live on 2026-09-03: x00423's own three
 * slices were rejected that way, by the fix that x00423 shipped.
 *
 * The rule these tests pin: a code span inside a file entry IS the
 * path. An entry with no code span is still judged strictly, so real
 * prose and globs stay rejected.
 */

import { describe, expect, it } from 'vitest';

import { resolveCommitScope } from '../../../../src/lib/services/resolve-scope';

const resolve = (declaredFiles: readonly string[]) =>
	resolveCommitScope({
		proposalId: 'x00423',
		sliceId: 'S1',
		declaredFiles,
		workspaceDirty: [],
	});

describe('resolveCommitScope on real proposal prose', () => {
	it('takes the path out of a sub-bullet with an em-dash explanation', () => {
		const scope = resolve([
			'- `plugins/commit-policy/src/lib/triggers/slice-listener.ts` — el primer sondeo deja de ser incondicionalmente mudo',
		]);
		expect(scope.files).toEqual([
			'plugins/commit-policy/src/lib/triggers/slice-listener.ts',
		]);
		expect(scope.unresolvedEntries).toEqual([]);
	});

	it('takes the FIRST code span when the prose mentions others', () => {
		// The tail routinely names symbols and other files. Only the
		// leading token is the subject of the entry.
		const scope = resolve([
			'- `a/b.ts` — for each slice in `onStatuses`, ask `IProcessedEventsStore`',
		]);
		expect(scope.files).toEqual(['a/b.ts']);
	});

	it('still rejects an entry that names no path at all', () => {
		const scope = resolve([
			'see files list below',
			'closing documentation',
		]);
		expect(scope.files).toEqual([]);
		expect(scope.unresolvedEntries).toHaveLength(2);
	});

	it('still rejects a glob', () => {
		const scope = resolve(['packages/**/*.ts']);
		expect(scope.files).toEqual([]);
		expect(scope.unresolvedEntries[0]?.reason).toBe('glob');
	});

	it('accepts a plain bare path unchanged', () => {
		const scope = resolve(['plain/path/file.ts']);
		expect(scope.files).toEqual(['plain/path/file.ts']);
	});
});

describe('resolveCommitScope — the code span must lead the entry', () => {
	it('does not mistake a code span inside a description for a path', () => {
		// "every `.md` under `docs/`" mentions two code spans and names
		// no file. Taking the first one would commit `.md`.
		const scope = resolve(['every `.md` under `docs/`']);
		expect(scope.files).toEqual([]);
		expect(scope.unresolvedEntries[0]?.reason).toBe('vague-language');
	});

	it('accepts the leading code span even after a list marker', () => {
		expect(resolve(['* `a/b.ts` — note']).files).toEqual(['a/b.ts']);
	});
});
