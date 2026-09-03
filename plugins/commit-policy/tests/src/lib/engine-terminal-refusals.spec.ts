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

import { ENGINE_REFUSAL_CODES } from '../../../src/lib/engine';

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
