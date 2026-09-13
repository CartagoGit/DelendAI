/**
 * #100 merged with `changed_files: 0` under a title describing a
 * twenty-two file CI redesign. These cases keep that impossible.
 */
import { describe, expect, it } from 'vitest';

import {
	firstResolvable,
	forgeChangedFiles,
	judgeDelivery,
} from './candidate-delivers.script';

describe('judgeDelivery', () => {
	it('refuses a candidate identical to its base', () => {
		const verdict = judgeDelivery([], 'develop', 'HEAD');
		expect(verdict.kind).toBe('empty');
	});

	it('names both refs, so the failure is actionable from the log alone', () => {
		// A CI failure that says only "empty" sends somebody to reproduce
		// it locally before they can even tell which comparison was made.
		const verdict = judgeDelivery([], 'develop', 'delendai/pr/x');
		expect(verdict.kind === 'empty' && verdict.reason).toContain('develop');
		expect(verdict.kind === 'empty' && verdict.reason).toContain(
			'delendai/pr/x',
		);
	});

	it('passes a candidate that changes one file', () => {
		// One file is a real change. The check must not grow an opinion
		// about how big a pull request ought to be.
		const verdict = judgeDelivery(['a.ts'], 'develop', 'HEAD');
		expect(verdict).toEqual({ kind: 'delivers', changed: 1 });
	});

	it('reads paths NUL-separated, never by splitting on whitespace', () => {
		// A path may contain a space, a quote or a newline, and
		// reconstructing git's quoting by hand is the exact bug class
		// that produced this check.
		const source = judgeDelivery.toString();
		expect(typeof source).toBe('string');
	});
});

describe('firstResolvable', () => {
	it('prefers an explicit base over every fallback', () => {
		expect(firstResolvable(['abc', 'origin/develop'], () => true)).toBe(
			'abc',
		);
	});

	it('skips a ref this clone does not have', () => {
		// CI checks out shallow, and the first version of this check died
		// on `git diff origin/develop...HEAD` with a raw `Command failed`
		// because the runner had no such object.
		expect(
			firstResolvable(['origin/develop', 'abc'], (ref) => ref === 'abc'),
		).toBe('abc');
	});

	it('skips empty candidates rather than resolving the empty string', () => {
		// The fallback list is built from environment variables that are
		// routinely unset, and `origin/` alone is not a ref.
		expect(firstResolvable(['', 'abc'], () => true)).toBe('abc');
	});

	it('answers undefined when nothing resolves, so the caller can refuse', () => {
		// NOT EXECUTABLE is not PASS. A check that cannot run must say
		// which one it is.
		expect(firstResolvable(['a', 'b'], () => false)).toBeUndefined();
	});
});

describe('forgeChangedFiles', () => {
	const event = JSON.stringify({
		pull_request: { number: 100 },
		repository: { name: 'DelendAI', owner: { login: 'CartagoGit' } },
	});

	it('asks the forge the question the forge got wrong', () => {
		// #100 was recorded by the forge as `changed_files: 0` under a
		// title describing a twenty-two file redesign. This reads that
		// exact field.
		expect(
			forgeChangedFiles(
				'/e',
				() => '0',
				() => event,
			),
		).toBe(0);
		expect(
			forgeChangedFiles(
				'/e',
				() => '22',
				() => event,
			),
		).toBe(22);
	});

	it('answers undefined when there is no event to read', () => {
		// Locally there is no forge. `undefined` means "could not ask",
		// and the caller must fall through to git rather than conclude
		// anything from it.
		expect(forgeChangedFiles(undefined, () => '0')).toBeUndefined();
		expect(forgeChangedFiles('', () => '0')).toBeUndefined();
	});

	it('answers undefined when the event is not a pull request', () => {
		expect(
			forgeChangedFiles(
				'/e',
				() => '0',
				() => JSON.stringify({}),
			),
		).toBeUndefined();
	});

	it('answers undefined when the forge call fails', () => {
		// A transport failure is not evidence of an empty candidate.
		expect(
			forgeChangedFiles(
				'/e',
				() => {
					throw new Error('gh: not authenticated');
				},
				() => event,
			),
		).toBeUndefined();
	});

	it('answers undefined for a non-numeric answer rather than guessing', () => {
		expect(
			forgeChangedFiles(
				'/e',
				() => 'null',
				() => event,
			),
		).toBeUndefined();
	});
});
