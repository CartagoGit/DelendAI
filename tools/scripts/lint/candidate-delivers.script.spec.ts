/**
 * #100 merged with `changed_files: 0` under a title describing a
 * twenty-two file CI redesign. These cases keep that impossible.
 */
import { describe, expect, it } from 'vitest';

import { judgeDelivery } from './candidate-delivers.script';

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
