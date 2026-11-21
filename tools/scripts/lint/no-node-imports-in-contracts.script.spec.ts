/**
 * Specs for the pure finder of `no-node-imports-in-contracts`.
 *
 * The lint had no spec. It compared the bare module name followed by a
 * quote, so `node:fs/promises` passed while `node:fs` was refused — the
 * same module. These cases pin the subpath, the comment skip, and that
 * look-alike names are not caught.
 */
import { describe, expect, it } from 'vitest';

import { findForbiddenModuleImports } from './no-node-imports-in-contracts.script';

const find = (...lines: string[]) =>
	findForbiddenModuleImports(lines.join('\n'));

describe('findForbiddenModuleImports', () => {
	it('flags a node builtin with and without the node: scheme', () => {
		expect(
			find("import { a } from 'node:fs';", "import { b } from 'os';"),
		).toEqual([
			{ line: 1, module: 'node:fs' },
			{ line: 2, module: 'os' },
		]);
	});

	it('treats a subpath as the module it belongs to', () => {
		expect(find("import { rm } from 'node:fs/promises';")).toEqual([
			{ line: 1, module: 'node:fs' },
		]);
	});

	it('flags @delendai/core and its subpaths', () => {
		expect(find("import type { X } from '@delendai/core/public';")).toEqual(
			[{ line: 1, module: '@delendai/core' }],
		);
	});

	it('flags a side-effect import', () => {
		expect(find("import 'node:crypto';")).toEqual([
			{ line: 1, module: 'node:crypto' },
		]);
	});

	it('ignores comment lines', () => {
		expect(
			find("// import { a } from 'node:fs';", " * from 'node:os'"),
		).toEqual([]);
	});

	it('does not catch a module whose name only starts the same', () => {
		expect(
			find(
				"import { a } from 'fsx';",
				"import { b } from '@delendai/contracts';",
			),
		).toEqual([]);
	});
});
