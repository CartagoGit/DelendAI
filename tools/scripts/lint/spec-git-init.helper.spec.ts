import { describe, expect, it } from 'vitest';

import {
	countGitInits,
	isE2eTier,
	isFastSpec,
	isFastTestSupport,
} from './spec-git-init.helper';

describe('isFastSpec', () => {
	it('[<5ms] is every spec outside the e2e tier', () => {
		expect(isFastSpec('a/b.spec.ts')).toBe(true);
		expect(isFastSpec('a/b.e2e.spec.ts')).toBe(false);
		expect(isFastSpec('tests/e2e/b.spec.ts')).toBe(false);
		expect(isFastSpec('a/b.ts')).toBe(false);
		expect(isE2eTier('a/e2e/b.spec.ts')).toBe(true);
	});
});

describe('isFastTestSupport', () => {
	it('[<5ms] is a module specs import for setup, outside the e2e tier', () => {
		expect(
			isFastTestSupport(
				'packages/core/tests/src/lib/unit-repo.helper.ts',
			),
		).toBe(true);
		expect(isFastTestSupport('plugins/x/test/setup.ts')).toBe(true);
		expect(isFastTestSupport('packages/core/tests/a.spec.ts')).toBe(false);
		expect(isFastTestSupport('packages/core/tests/e2e/repo.ts')).toBe(
			false,
		);
		expect(isFastTestSupport('packages/core/tests/fixtures/repo.ts')).toBe(
			false,
		);
		expect(isFastTestSupport('packages/core/src/lib/repo.ts')).toBe(false);
	});
});

describe('countGitInits', () => {
	it('[<4ms] counts git init as an argument list or a command line', () => {
		const text = [
			"execFileSync('git', ['init', '-q'], { cwd });",
			"git(root, 'init', '-q', '-b', 'develop');",
			'run(`git init ${dir}`);',
		].join('\n');
		expect(countGitInits(text)).toBe(3);
	});

	it('[<4ms] ignores comments and a template built for the file', () => {
		const text = [
			'// git init was here',
			' * runs git init once',
			'const template = createGitRepoTemplate({});',
		].join('\n');
		expect(countGitInits(text)).toBe(0);
	});
});
