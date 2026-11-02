/**
 * plugin-size-report.script.spec.ts — the size figures are counted under one
 * stated definition, the same way every time.
 */
import { describe, expect, it } from 'vitest';

import {
	countLines,
	formatSizeReport,
	isCountedFile,
	isTestFile,
	measurePackages,
	packageOf,
	SIZE_DEFINITION,
} from './plugin-size-report.script';

describe('what is counted', () => {
	it('counts TypeScript sources and leaves declarations and generated files out', () => {
		expect(isCountedFile('plugins/a/src/x.ts')).toBe(true);
		expect(isCountedFile('plugins/a/src/view.tsx')).toBe(true);
		expect(isCountedFile('plugins/a/src/x.d.ts')).toBe(false);
		expect(isCountedFile('plugins/a/src/generated/x.ts')).toBe(false);
		expect(isCountedFile('plugins/a/src/x.generated.ts')).toBe(false);
		expect(isCountedFile('plugins/a/README.md')).toBe(false);
	});

	it('tells a test from a source by its name or its folder', () => {
		expect(isTestFile('plugins/a/src/x.spec.ts')).toBe(true);
		expect(isTestFile('plugins/a/src/x.e2e.spec.ts')).toBe(true);
		expect(isTestFile('plugins/a/src/x.test.tsx')).toBe(true);
		expect(isTestFile('plugins/a/tests/src/helper.ts')).toBe(true);
		expect(isTestFile('plugins/a/src/__tests__/helper.ts')).toBe(true);
		expect(isTestFile('plugins/a/src/x.ts')).toBe(false);
	});

	it('names the package by its first two segments under a package root', () => {
		expect(packageOf('plugins/proposals/src/index.ts')).toBe(
			'plugins/proposals',
		);
		expect(packageOf('packages/core/src/a.ts')).toBe('packages/core');
		expect(packageOf('tools/scripts/report/x.ts')).toBe('tools');
		expect(packageOf('plugins/index.ts')).toBe('plugins');
	});

	it('counts physical lines, blank ones included, with or without a final newline', () => {
		expect(countLines('')).toBe(0);
		expect(countLines('a')).toBe(1);
		expect(countLines('a\n')).toBe(1);
		expect(countLines('a\n\nb\n')).toBe(3);
		expect(countLines('a\n\nb')).toBe(3);
	});
});

describe('measurePackages', () => {
	const rows = measurePackages([
		{ path: 'plugins/b/src/x.ts', lines: 10 },
		{ path: 'plugins/b/src/y.ts', lines: 5 },
		{ path: 'plugins/b/tests/src/x.spec.ts', lines: 7 },
		{ path: 'plugins/a/src/x.ts', lines: 3 },
		{ path: 'plugins/a/src/x.d.ts', lines: 99 },
		{ path: 'plugins/a/src/generated/x.ts', lines: 99 },
	]);

	it('separates source from test lines per package, in a stable order', () => {
		expect(rows).toEqual([
			{
				name: 'plugins/a',
				sourceFiles: 1,
				sourceLines: 3,
				testFiles: 0,
				testLines: 0,
			},
			{
				name: 'plugins/b',
				sourceFiles: 2,
				sourceLines: 15,
				testFiles: 1,
				testLines: 7,
			},
		]);
	});

	it('is the same for the same files in any order', () => {
		const files = [
			{ path: 'plugins/b/src/x.ts', lines: 10 },
			{ path: 'plugins/a/src/x.ts', lines: 3 },
		];
		expect(measurePackages([...files].reverse())).toEqual(
			measurePackages(files),
		);
	});
});

describe('formatSizeReport', () => {
	it('prints the definition, the revision and a total row', () => {
		const text = formatSizeReport(
			measurePackages([
				{ path: 'plugins/a/src/x.ts', lines: 3 },
				{ path: 'plugins/b/src/x.spec.ts', lines: 4 },
			]),
			'abc123',
		);
		expect(text).toContain('Revision: abc123');
		for (const line of SIZE_DEFINITION.split('\n'))
			expect(text).toContain(line);
		expect(text).toMatch(/plugins\/a\s+1\s+3\s+0\s+0/u);
		expect(text).toMatch(/total\s+1\s+3\s+1\s+4/u);
	});
});
