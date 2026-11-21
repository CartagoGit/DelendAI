/**
 * path-importers.spec.ts — a file that imports a changed one by its path
 * is found wherever it lives.
 */
import { describe, expect, it } from 'vitest';

import { repoRoot } from '../lib/repo-root';

import { importsByPath, pathImportersOf } from './path-importers';

const CHANGED = new Set(['tools/scripts/lint/mass-content-removal.script.ts']);

describe('importsByPath', () => {
	it('sees a relative import that resolves to the changed file', () => {
		expect(
			importsByPath(
				'plugins/proposals/tests/src/lib/mass-removal.spec.ts',
				"import { a } from '../../../../../tools/scripts/lint/mass-content-removal.script';",
				CHANGED,
			),
		).toBe(true);
	});

	it('sees it with the extension written, and in a dynamic import', () => {
		expect(
			importsByPath(
				'tools/scripts/lint/x.spec.ts',
				"const m = await import('./mass-content-removal.script.ts');",
				CHANGED,
			),
		).toBe(true);
	});

	it('is not fooled by a file of the same name elsewhere', () => {
		expect(
			importsByPath(
				'plugins/a/tests/x.spec.ts',
				"import { a } from './mass-content-removal.script';",
				CHANGED,
			),
		).toBe(false);
	});

	it('ignores package imports', () => {
		expect(
			importsByPath(
				'plugins/a/tests/x.spec.ts',
				"import { a } from '@delendai/core/public';",
				CHANGED,
			),
		).toBe(false);
	});
});

describe('pathImportersOf', () => {
	it('finds this spec as an importer of the module it tests', () => {
		expect(
			pathImportersOf(repoRoot(), ['tools/scripts/ci/path-importers.ts']),
		).toContain('tools/scripts/ci/path-importers.spec.ts');
	});

	it('answers nothing for a change that is not source', () => {
		expect(pathImportersOf(repoRoot(), ['docs/x.md'])).toEqual([]);
	});
});
