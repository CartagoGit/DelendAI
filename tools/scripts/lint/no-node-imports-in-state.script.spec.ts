/**
 * Specs for the pure finder of `no-node-imports-in-state`.
 *
 * The lint had no spec. It deleted block comments outright, so every
 * finding after a multi-line comment reported a line that was too early,
 * and it matched bare module names only, so `node:fs/promises` passed.
 */
import { describe, expect, it } from 'vitest';

import { findStateImportViolations } from './no-node-imports-in-state.script';

const find = (...lines: string[]) =>
	findStateImportViolations(lines.join('\n'));

describe('findStateImportViolations', () => {
	it('reports the real line after a multi-line block comment', () => {
		expect(
			find(
				'/**',
				' * a doc block',
				' */',
				"import { a } from 'node:fs';",
			),
		).toEqual([{ line: 4, module: 'node:fs', rule: 'forbidden-module' }]);
	});

	it('treats a subpath as the module it belongs to', () => {
		expect(find("import { rm } from 'node:fs/promises';")).toEqual([
			{ line: 1, module: 'node:fs', rule: 'forbidden-module' },
		]);
	});

	it('flags require of a builtin', () => {
		expect(find("const p = require('path');")).toEqual([
			{ line: 1, module: 'path', rule: 'forbidden-module' },
		]);
	});

	it('flags the forbidden @delendai packages and their subpaths', () => {
		expect(
			find(
				"import { x } from '@delendai/core';",
				"import type { S } from '@delendai/state-sqlite/lib';",
			),
		).toEqual([
			{
				line: 1,
				module: '@delendai/core',
				rule: 'forbidden-at-delendai',
			},
			{
				line: 2,
				module: '@delendai/state-sqlite',
				rule: 'forbidden-at-delendai',
			},
		]);
	});

	it('does not catch a look-alike package or a commented import', () => {
		expect(
			find(
				"import { ok } from '@delendai/stateful';",
				"// import { a } from 'node:fs';",
			),
		).toEqual([]);
	});
});
