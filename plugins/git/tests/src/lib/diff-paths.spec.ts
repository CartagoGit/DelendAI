import { describe, expect, it } from 'vitest';

import { parseDiffFilePaths } from '@delendai/git/lib/services/git';

describe('parseDiffFilePaths', () => {
	it('[<150ms] reads destination paths from headers and +++ lines', () => {
		const diff = [
			'diff --git a/src/a.ts b/src/a.ts',
			'--- a/src/a.ts',
			'+++ b/src/a.ts',
			'diff --git a/old name.ts b/new name.ts',
			'+++ b/other.ts',
		].join('\n');
		expect(parseDiffFilePaths(diff)).toEqual([
			'src/a.ts',
			'new name.ts',
			'other.ts',
		]);
	});

	it('[<150ms] ignores malformed headers', () => {
		expect(
			parseDiffFilePaths('diff --git a/x\ndiff --git a/ b/\n'),
		).toEqual([]);
	});

	it('[<150ms] stays linear on adversarial headers', () => {
		const hostile = `diff --git a/${' b/'.repeat(50_000)}\n`.repeat(2);
		const started = performance.now();
		parseDiffFilePaths(hostile);
		expect(performance.now() - started).toBeLessThan(100);
	});
});
