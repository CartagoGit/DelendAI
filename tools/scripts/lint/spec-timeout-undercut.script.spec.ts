#!/usr/bin/env bun
/**
 * spec-timeout-undercut.script.spec.ts — x00542 S3.
 *
 * The cases that decide whether this gate is worth having: it must see
 * a real per-test ceiling, and it must NOT see the dozen other things
 * that end in `}, 15_000)`.
 */
import { describe, expect, it } from 'vitest';

import {
	ceilingFor,
	declaredTimeoutOf,
	findUndercuts,
	splitTopLevelArgs,
	testCallTimeouts,
	trailingTimeoutOf,
	VITEST_DEFAULT_TIMEOUT_MS,
} from './spec-timeout-undercut.script.ts';

describe('testCallTimeouts', () => {
	it('reads a trailing literal on it() and test()', () => {
		const source = [
			"it('a', async () => {",
			'\texpect(1).toBe(1);',
			'}, 15_000);',
			"test('b', () => {}, 2000);",
		].join('\n');

		expect(testCallTimeouts(source)).toEqual([
			{ line: 3, timeoutMs: 15_000 },
			{ line: 4, timeoutMs: 2_000 },
		]);
	});

	it('reads the options-object form', () => {
		expect(
			testCallTimeouts("it('a', { timeout: 30_000 }, () => {});"),
		).toEqual([{ line: 1, timeoutMs: 30_000 }]);
	});

	it('reports the line of the closing paren, however long the test is', () => {
		const source = [
			"it('first', () => {",
			...Array.from({ length: 40 }, () => '\t// body'),
			'}, 1000);',
			'',
			"it('second', () => {",
			'\t// body',
			'}, 2000);',
		].join('\n');

		expect(testCallTimeouts(source)).toEqual([
			{ line: 42, timeoutMs: 1_000 },
			{ line: 46, timeoutMs: 2_000 },
		]);
	});

	describe('what it must not read as a ceiling', () => {
		it('ignores a setTimeout that closes the same way', () => {
			expect(
				testCallTimeouts('setTimeout(() => {\n\tdone();\n}, 100);'),
			).toEqual([]);
		});

		it('ignores a reduce seeded with a number', () => {
			expect(
				testCallTimeouts(
					"it('a', () => {\n\tconst n = xs.reduce((acc, x) => {\n\t\treturn acc + x;\n\t}, 0);\n});",
				),
			).toEqual([]);
		});

		it('ignores a `timeout` field that belongs to the code under test', () => {
			// A real finding this gate produced before it looked at
			// arguments instead of at the whole body.
			expect(
				testCallTimeouts(
					"it('coerces options', () => {\n\texpect(result).toEqual({ timeout: 500, path: '/a' });\n});",
				),
			).toEqual([]);
		});

		it('ignores the shape inside a string or a comment', () => {
			expect(
				testCallTimeouts(
					"const doc = 'it(\\'x\\', () => {}, 1000)';\n// it('y', () => {}, 2000);\n",
				),
			).toEqual([]);
		});

		it('ignores a property access that happens to be called it', () => {
			expect(testCallTimeouts('runner.it(fn, 1000);')).toEqual([]);
		});

		it('ignores a call with no timeout at all', () => {
			expect(testCallTimeouts("it('a', () => {});")).toEqual([]);
		});
	});
});

describe('trailingTimeoutOf', () => {
	it('takes the last positional argument when it is a number', () => {
		expect(trailingTimeoutOf("'a', fn, 15_000")).toBe(15_000);
	});

	it('leaves a named constant alone, because a name is a decision', () => {
		expect(trailingTimeoutOf("'a', fn, SLOW_MS")).toBeUndefined();
	});

	it('does not read a number that is the only argument', () => {
		expect(trailingTimeoutOf('15_000')).toBeUndefined();
	});
});

describe('splitTopLevelArgs', () => {
	it('splits only at the commas that separate arguments', () => {
		expect(splitTopLevelArgs("'a, b', { x: 1, y: [2, 3] }, fn")).toEqual([
			"'a, b'",
			'{ x: 1, y: [2, 3] }',
			'fn',
		]);
	});
});

describe('declaredTimeoutOf', () => {
	it('reads a literal', () => {
		expect(declaredTimeoutOf('test: { testTimeout: 30_000 }')).toBe(30_000);
	});

	it('follows one level of named constant', () => {
		expect(
			declaredTimeoutOf(
				'const SUITE_TIMEOUT_MS = 30_000;\ntest: { testTimeout: SUITE_TIMEOUT_MS }',
			),
		).toBe(30_000);
	});

	it("falls back to vitest's own default when nothing is declared", () => {
		expect(declaredTimeoutOf('test: { include: [] }')).toBe(
			VITEST_DEFAULT_TIMEOUT_MS,
		);
	});
});

describe('ceilingFor', () => {
	const projects = [
		{ dir: '/repo/packages/core', timeoutMs: 120_000 },
		{ dir: '/repo/packages/core/nested', timeoutMs: 30_000 },
	];

	it('takes the nearest config, not the first one that matches', () => {
		expect(
			ceilingFor('/repo/packages/core/nested/a.spec.ts', projects)
				?.timeoutMs,
		).toBe(30_000);
	});

	it('answers nothing for a spec under no project', () => {
		expect(ceilingFor('/elsewhere/a.spec.ts', projects)).toBeUndefined();
	});
});

describe('findUndercuts', () => {
	const files = [
		'/repo/pkg/vitest.config.ts',
		'/repo/pkg/a.spec.ts',
		'/repo/pkg/b.spec.ts',
	];
	const read = (path: string): string =>
		path.endsWith('vitest.config.ts')
			? 'test: { testTimeout: 30_000 }'
			: path.endsWith('a.spec.ts')
				? "it('slow', () => {}, 10_000);"
				: "it('slower', () => {}, 60_000);";

	it('reports the literal below the ceiling and not the one above it', () => {
		const findings = findUndercuts(files, read);

		expect(findings).toHaveLength(1);
		expect(findings[0]?.specPath).toBe('/repo/pkg/a.spec.ts');
		expect(findings[0]?.timeoutMs).toBe(10_000);
		expect(findings[0]?.projectTimeoutMs).toBe(30_000);
	});
});
