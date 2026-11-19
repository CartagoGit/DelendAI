/**
 * ref-kinds-known.script.spec.ts — which refs the lint flags.
 */
import { describe, expect, it } from 'vitest';

import { shortRefName, unknownKindRefs } from './ref-kinds-known.script';

describe('unknownKindRefs', () => {
	it('[<200ms] accepts every listed kind, local or remote', () => {
		const refs = [
			'refs/heads/delendai/wip/m/x',
			'refs/remotes/origin/delendai/pr/x',
			'refs/delendai/retired/m/x',
			'refs/heads/delendai/queue/batch-1',
			'refs/heads/delendai/train/a',
			'refs/heads/delendai/rehearsal/r',
		];
		expect(unknownKindRefs(refs, ['delendai'])).toEqual([]);
	});

	it('[<200ms] flags a folder no kind owns, in any owned namespace', () => {
		const refs = [
			'refs/heads/delendai/mystery/x',
			'refs/heads/old/zzz/y',
			'refs/heads/feat/free',
		];
		expect(unknownKindRefs(refs, ['delendai', 'old'])).toEqual([
			'delendai/mystery/x',
			'old/zzz/y',
		]);
	});

	it('[<200ms] reads nothing under an empty namespace', () => {
		expect(unknownKindRefs(['refs/heads/zzz/y'], [''])).toEqual([]);
	});

	it('[<200ms] shortens the three ref spellings', () => {
		expect(shortRefName('refs/remotes/origin/a/b')).toBe('a/b');
		expect(shortRefName('refs/heads/a/b')).toBe('a/b');
		expect(shortRefName('refs/a/retired/b')).toBe('a/retired/b');
	});
});
