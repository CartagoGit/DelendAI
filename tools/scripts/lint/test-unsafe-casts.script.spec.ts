import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { scanViolations } from './test-unsafe-casts.script';

describe('test-unsafe-casts lint', () => {
	let root = '';

	const write = (rel: string, body: string): void => {
		const abs = join(root, rel);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, body, 'utf8');
	};

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'test-unsafe-casts-'));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('counts as unknown / as any / as never / @ts-expect-error in test files', () => {
		write(
			'packages/foo/tests/thing.spec.ts',
			'const a = x as unknown as Y;\n' +
				'const b = y as any;\n' +
				'const c = z as never;\n' +
				'// @ts-expect-error\n' +
				'const d = 1;\n',
		);
		const result = scanViolations(root);
		// `as unknown as Y` matches the `as unknown` pattern once.
		expect(result['packages/foo/tests/thing.spec.ts']).toBe(4);
	});

	it('ignores non-test files entirely', () => {
		write(
			'packages/foo/src/thing.ts',
			'export const bad = (x: unknown) => x as any;\n',
		);
		expect(scanViolations(root)).toEqual({});
	});

	it('ignores files outside the scanned product roots (e.g. tools/)', () => {
		write(
			'tools/scripts/lint/some.script.spec.ts',
			"const fixture = 'x as any';\n",
		);
		expect(scanViolations(root)).toEqual({});
	});

	it('matches both .spec.ts and .test.ts', () => {
		write('plugins/bar/tests/a.spec.ts', 'const a = x as any;\n');
		write('plugins/bar/tests/b.test.ts', 'const b = y as any;\n');
		const result = scanViolations(root);
		expect(result['plugins/bar/tests/a.spec.ts']).toBe(1);
		expect(result['plugins/bar/tests/b.test.ts']).toBe(1);
	});

	it('a clean test file scores zero and is omitted from the result', () => {
		write(
			'apps/web/tests/clean.spec.ts',
			'import { fakePartial } from "@delendai/test-kit/public";\n' +
				'const x = fakePartial<{ a: string }, "a">({ a: "1" });\n',
		);
		expect(scanViolations(root)).toEqual({});
	});
});
