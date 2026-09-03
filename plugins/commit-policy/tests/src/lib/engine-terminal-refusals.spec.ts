/**
 * engine-terminal-refusals.spec.ts — refusals that must never be retried.
 *
 * An adopter project's server log on 2026-09-03 showed eight slices
 * re-emitted roughly once a second, indefinitely. Every one of them was
 * a refusal that could not possibly change on a retry:
 *
 *   - `git add` failing with "did not match any files", because the
 *     proposal's `Files:` list names paths from an older repo layout.
 *   - `git commit` failing with nothing staged.
 *
 * Both were answered `ack: 'ERR'` under the generic `BRANCH_PROTECTED`
 * fallback, which left the event pending, which scheduled another
 * attempt, which got the same answer.
 *
 * These tests pin the classification. The rule they encode: a refusal
 * that a retry cannot change is a FINAL ANSWER, and the engine says so
 * once instead of forever.
 */

import { describe, expect, it } from 'vitest';

import {
	ENGINE_REFUSAL_CODES,
	refusalToEngine,
	TERMINAL_REFUSAL_OUTCOMES,
} from '../../../src/lib/engine';

describe('engine refusal codes', () => {
	it('has a code for "the slice names files that do not exist"', () => {
		// Retrying `git add` on a path that is not in the repository
		// fails identically every time. It is a real problem for the
		// operator — a stale `Files:` list — reported once.
		expect(ENGINE_REFUSAL_CODES).toContain('SLICE_FILES_MISSING');
	});

	it('has a code for "the work is already committed"', () => {
		expect(ENGINE_REFUSAL_CODES).toContain('NOTHING_TO_COMMIT');
	});

	it('has an explicit code for an unrecognised failure', () => {
		// Unclassified failures used to be reported as
		// BRANCH_PROTECTED, so a log full of that code was really a log
		// full of "we have no idea" — and sent the reader chasing a
		// branch-protection problem that did not exist. A refusal must
		// never name a cause it has not established.
		expect(ENGINE_REFUSAL_CODES).toContain('UNKNOWN_REFUSAL');
	});
});

describe('classifying a REAL refusal string', () => {
	// Asserting that a code exists in a list is not the same as
	// asserting that git's own words reach it. Every loop this repo has
	// hit came from a refusal STRING arriving at a classifier that did
	// not recognise it, so these pin the strings.
	const terminal = (refusal: string): boolean => {
		const code = refusalToEngine(refusal).code;
		return (
			code !== undefined && TERMINAL_REFUSAL_OUTCOMES[code] !== undefined
		);
	};

	it('treats a gitignored path in a slice as final, not as a retry', () => {
		// Observed live on 2026-09-03: a slice declared a `.cache/…`
		// path in its `Files:` list. `git add` refuses it, and no
		// retry can change .gitignore — but the refusal fell through
		// to UNKNOWN_REFUSAL, which is not terminal, so the event was
		// re-emitted indefinitely.
		const refusal =
			'git add failed: The following paths are ignored by one of your .gitignore files: | .cache | hint: Use -f if you really want to add them.';
		expect(refusalToEngine(refusal).code).toBe('SLICE_FILES_IGNORED');
		expect(terminal(refusal)).toBe(true);
	});

	it('treats git’s "nothing to commit" as final', () => {
		// The string arrives buried in a hook runner's output, which is
		// why the whole line is used here rather than a tidy excerpt.
		const refusal =
			'git commit failed: nothing to commit, working tree clean | On branch develop | ╭───────╮ | 🥊 lefthook';
		expect(refusalToEngine(refusal).code).toBe('NOTHING_TO_COMMIT');
		expect(terminal(refusal)).toBe(true);
	});

	it('treats a stale Files: list as final', () => {
		const refusal =
			"git add failed: fatal: pathspec 'src/gone.ts' did not match any files";
		expect(refusalToEngine(refusal).code).toBe('SLICE_FILES_MISSING');
		expect(terminal(refusal)).toBe(true);
	});
});
