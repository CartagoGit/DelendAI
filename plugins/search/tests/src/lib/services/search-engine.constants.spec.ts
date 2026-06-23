import { describe, expect, it } from 'vitest';

import {
	clampContext,
	clampMaxResults,
	DEFAULT_EXTENSIONS,
	DEFAULT_IGNORE_DIRS,
	extensionOf,
	matchesAnyGlob,
	MAX_FILE_BYTES,
	preview,
} from '@mcp-vertex/search/lib/services/search-engine.constants';
import {
	compileGitignoreLine,
	isGitignored,
	parseGitignore,
} from '@mcp-vertex/search/lib/services/search-engine.gitignore';
import { globToRegExp } from '@mcp-vertex/search/lib/services/search-engine.glob';

describe('search-engine.constants (Solid SRP extraction)', () => {
	describe('clampMaxResults (pure)', () => {
		it('returns the default for undefined / NaN', () => {
			expect(clampMaxResults(undefined)).toBe(50);
			expect(clampMaxResults(Number.NaN)).toBe(50);
		});
		it('clamps to [1, 500]', () => {
			expect(clampMaxResults(0)).toBe(1);
			expect(clampMaxResults(-3)).toBe(1);
			expect(clampMaxResults(10_000)).toBe(500);
			expect(clampMaxResults(42)).toBe(42);
		});
		it('floors fractional inputs', () => {
			expect(clampMaxResults(42.7)).toBe(42);
		});
	});

	describe('clampContext (pure)', () => {
		it('returns the default for undefined / NaN', () => {
			expect(clampContext(undefined)).toBe(0);
			expect(clampContext(Number.NaN)).toBe(0);
		});
		it('clamps to [0, 10]', () => {
			expect(clampContext(-1)).toBe(0);
			expect(clampContext(11)).toBe(10);
			expect(clampContext(5)).toBe(5);
		});
	});

	describe('extensionOf (pure)', () => {
		it('returns the lower-cased extension without the dot', () => {
			expect(extensionOf('foo.ts')).toBe('ts');
			expect(extensionOf('foo.TSX')).toBe('tsx');
		});
		it('returns "" when the file has no dot', () => {
			expect(extensionOf('Makefile')).toBe('');
		});
	});

	describe('preview (pure)', () => {
		it('passes through short lines untouched', () => {
			expect(preview('short')).toBe('short');
		});
		it('truncates with an ellipsis when longer than the cap', () => {
			const long = 'x'.repeat(500);
			const out = preview(long);
			expect(out.length).toBeLessThanOrEqual(240);
			expect(out.endsWith('…')).toBe(true);
		});
	});

	describe('matchesAnyGlob (pure)', () => {
		const re = globToRegExp('src/**/*.ts');
		it('matches when at least one glob matches', () => {
			expect(matchesAnyGlob('src/a/b.ts', [re])).toBe(true);
		});
		it('returns false when no glob matches', () => {
			expect(matchesAnyGlob('README.md', [re])).toBe(false);
		});
		it('returns false for an empty glob list (no matchers)', () => {
			expect(matchesAnyGlob('src/a.ts', [])).toBe(false);
		});
	});

	describe('data defaults (sanity)', () => {
		it('DEFAULT_EXTENSIONS is non-empty and includes common text types', () => {
			expect(DEFAULT_EXTENSIONS.length).toBeGreaterThan(5);
			expect(DEFAULT_EXTENSIONS).toContain('ts');
			expect(DEFAULT_EXTENSIONS).toContain('md');
		});
		it('DEFAULT_IGNORE_DIRS skips noise (node_modules / .git / build / dist)', () => {
			expect(DEFAULT_IGNORE_DIRS).toContain('node_modules');
			expect(DEFAULT_IGNORE_DIRS).toContain('.git');
			expect(DEFAULT_IGNORE_DIRS).toContain('dist');
			expect(DEFAULT_IGNORE_DIRS).toContain('build');
		});
		it('MAX_FILE_BYTES is the documented 1 MB ceiling', () => {
			expect(MAX_FILE_BYTES).toBe(1024 * 1024);
		});
	});
});

describe('search-engine.glob (Solid SRP extraction)', () => {
	it('matches a simple `*` glob within a single segment', () => {
		const re = globToRegExp('*.ts');
		expect(re.test('foo.ts')).toBe(true);
		expect(re.test('sub/foo.ts')).toBe(false);
	});
	it('matches `**` across path separators', () => {
		const re = globToRegExp('src/**/*.ts');
		expect(re.test('src/a.ts')).toBe(true);
		expect(re.test('src/sub/b.ts')).toBe(true);
		expect(re.test('other/c.ts')).toBe(false);
	});
	it('treats `?` as one non-slash char', () => {
		const re = globToRegExp('a?c');
		expect(re.test('abc')).toBe(true);
		expect(re.test('ac')).toBe(false);
		expect(re.test('a/c')).toBe(false);
	});
	it('escapes regex metacharacters literally', () => {
		const re = globToRegExp('foo+bar.ts');
		expect(re.test('foo+bar.ts')).toBe(true);
		expect(re.test('foobar.ts')).toBe(false);
	});
});

describe('search-engine.gitignore (Solid SRP extraction)', () => {
	describe('parseGitignore (pure)', () => {
		it('returns [] for empty input', () => {
			expect(parseGitignore('')).toEqual([]);
		});
		it('drops comment and blank lines', () => {
			expect(parseGitignore('# this is a comment\n\n   \n')).toEqual([]);
		});
		it('parses a single bare segment as depth-agnostic', () => {
			const rules = parseGitignore('node_modules');
			expect(rules).toHaveLength(1);
			expect(rules[0]?.negate).toBe(false);
		});
		it('marks `!foo` as a negation', () => {
			const rules = parseGitignore('!keep.me');
			expect(rules[0]?.negate).toBe(true);
		});
		it('marks trailing `/` as dirOnly', () => {
			const rules = parseGitignore('build/');
			expect(rules[0]?.dirOnly).toBe(true);
		});
	});

	describe('isGitignored (pure, last-rule-wins)', () => {
		it('returns false on an empty rule set', () => {
			expect(isGitignored('anywhere.ts', false, [])).toBe(false);
		});
		it('skips dirOnly rules for files', () => {
			const rules = parseGitignore('build/');
			expect(isGitignored('build/file.ts', false, rules)).toBe(false);
		});
		it('matches dirOnly rules for directories', () => {
			const rules = parseGitignore('build/');
			expect(isGitignored('build', true, rules)).toBe(true);
		});
		it('last rule wins (negation after match = not ignored)', () => {
			const rules = parseGitignore('node_modules\n!node_modules/keep.ts');
			expect(isGitignored('node_modules/foo.ts', false, rules)).toBe(
				true,
			);
			expect(isGitignored('node_modules/keep.ts', false, rules)).toBe(
				false,
			);
		});
	});

	describe('compileGitignoreLine (pure)', () => {
		it('returns undefined for empty / comment / malformed lines', () => {
			expect(compileGitignoreLine('')).toBeUndefined();
			expect(compileGitignoreLine('# comment')).toBeUndefined();
			expect(compileGitignoreLine('!')).toBeUndefined(); // empty after negation
		});
		it('returns a rule for a valid line', () => {
			const rule = compileGitignoreLine('foo/');
			expect(rule).toBeDefined();
			expect(rule?.dirOnly).toBe(true);
		});
	});
});
