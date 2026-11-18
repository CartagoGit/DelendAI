import { describe, expect, it } from 'vitest';

import {
	findLiteralTmpMkdtemps,
	literalTmpMkdtemps,
} from './test-temp-root.script';

describe('test-temp-root (x01091)', () => {
	it('refuses a literal /tmp path and names the line', () => {
		expect(
			literalTmpMkdtemps(
				'a.spec.ts',
				"const a = 1;\nmkdtempSync('/tmp/x-');",
			),
		).toEqual([
			{ path: 'a.spec.ts', line: 2, text: "mkdtempSync('/tmp/x-');" },
		]);
		expect(
			literalTmpMkdtemps('a.spec.ts', 'await mkdtemp(`/tmp/${n}-`)'),
		).toHaveLength(1);
	});

	it('accepts a path under tmpdir()', () => {
		expect(
			findLiteralTmpMkdtemps([
				{
					path: 'a.spec.ts',
					text: "mkdtempSync(join(tmpdir(), 'x-'));\nmkdtemp(join(os.tmpdir(), 'y-'));",
				},
			]),
		).toEqual([]);
	});
});
