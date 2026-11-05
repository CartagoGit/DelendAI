import { describe, expect, it } from 'vitest';

import { countGitInits, isE2eTier, isFastSpec } from './spec-git-init.helper';

describe('isFastSpec', () => {
	it('is every spec outside the e2e tier', () => {
		expect(isFastSpec('a/b.spec.ts')).toBe(true);
		expect(isFastSpec('a/b.e2e.spec.ts')).toBe(false);
		expect(isFastSpec('tests/e2e/b.spec.ts')).toBe(false);
		expect(isFastSpec('a/b.ts')).toBe(false);
		expect(isE2eTier('a/e2e/b.spec.ts')).toBe(true);
	});
});

describe('countGitInits', () => {
	it('counts git init as an argument list or a command line', () => {
		const text = [
			"execFileSync('git', ['init', '-q'], { cwd });",
			"git(root, 'init', '-q', '-b', 'develop');",
			'run(`git init ${dir}`);',
		].join('\n');
		expect(countGitInits(text)).toBe(3);
	});

	it('ignores comments and a template built for the file', () => {
		const text = [
			'// git init was here',
			' * runs git init once',
			'const template = createGitRepoTemplate({});',
		].join('\n');
		expect(countGitInits(text)).toBe(0);
	});
});
