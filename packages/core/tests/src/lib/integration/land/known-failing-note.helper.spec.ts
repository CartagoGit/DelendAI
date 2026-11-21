import { describe, expect, it } from 'vitest';

import {
	knownFailingNoteOf,
	knownFailingNotesRef,
	parseKnownFailingNote,
	readKnownFailing,
} from '@delendai/core/lib/integration/land/known-failing-note.helper';

describe('known-failing note, writer side', () => {
	it('[<50ms] keys the note by the red commit on a ref under the namespace', () => {
		const note = knownFailingNoteOf({
			namespace: 'dl',
			commit: 'red1',
			failingSpecs: new Set(['b.spec.ts', 'a.spec.ts']),
		});
		expect(note).toEqual({
			ref: 'refs/notes/dl/known-failing',
			commit: 'red1',
			content: '["a.spec.ts","b.spec.ts"]\n',
		});
	});

	it('[<50ms] writes an empty set when the run is green', () => {
		const note = knownFailingNoteOf({
			namespace: 'dl',
			commit: 'g',
			failingSpecs: [],
		});
		expect(parseKnownFailingNote(note.content).size).toBe(0);
	});

	it('[<50ms] falls back to a default namespace when the project has none', () => {
		expect(knownFailingNotesRef('')).toBe(
			'refs/notes/delendai/known-failing',
		);
	});
});

/** A fake git: first-parent chain `c3 c2 c1`, notes by commit. */
const fakeGit = (notes: Record<string, string>) => {
	const calls: string[][] = [];
	return {
		calls,
		git: (args: readonly string[]) => {
			calls.push([...args]);
			if (args[0] === 'rev-list') return 'c3\nc2\nc1\n';
			if (args[0] === 'notes') return notes[args[3] ?? ''];
			return undefined;
		},
	};
};
const input = { namespace: 'dl', base: 'c3', remote: 'origin' };

describe('known-failing note, reader side', () => {
	it('[<50ms] reads the note of the base commit', () => {
		const { git } = fakeGit({ c3: '["x.spec.ts"]\n' });
		expect([...(readKnownFailing(git, input) ?? [])]).toEqual([
			'x.spec.ts',
		]);
	});

	it('[<50ms] falls back to the nearest first-parent ancestor with a note', () => {
		const { git } = fakeGit({ c1: '["old.spec.ts"]\n' });
		expect([...(readKnownFailing(git, input) ?? [])]).toEqual([
			'old.spec.ts',
		]);
	});

	it('[<50ms] stops at the nearest note, even an empty one', () => {
		const { git } = fakeGit({ c2: '[]\n', c1: '["old.spec.ts"]\n' });
		expect(readKnownFailing(git, input)?.size).toBe(0);
	});

	it('[<50ms] answers nothing when no note exists, so nothing is subtracted', () => {
		const { git } = fakeGit({});
		expect(readKnownFailing(git, input)).toBeUndefined();
	});

	it('[<50ms] fetches the notes ref first, and survives a failed fetch', () => {
		const { git, calls } = fakeGit({ c3: '[]' });
		readKnownFailing(git, input);
		expect(calls[0]).toEqual([
			'fetch',
			'-q',
			'origin',
			'+refs/notes/dl/known-failing:refs/notes/dl/known-failing',
		]);
	});

	it('[<50ms] holds no ids for an unreadable note', () => {
		expect(parseKnownFailingNote('not json').size).toBe(0);
		expect(parseKnownFailingNote('{"a":1}').size).toBe(0);
	});
});
