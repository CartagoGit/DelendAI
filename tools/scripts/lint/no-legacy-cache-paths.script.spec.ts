import { describe, expect, it } from 'vitest';

import { LEGACY_CACHE_PATH_PATTERN } from './no-legacy-cache-paths.constant';
import {
	findLegacyCachePaths,
	isScanned,
} from './no-legacy-cache-paths.script';

const retired = ['mcp', 'vertex'].join('-');
const legacy = `.cache/${retired}/foo`;

describe('no-legacy-cache-paths', () => {
	it('matches both retired spellings', () => {
		expect(LEGACY_CACHE_PATH_PATTERN.test(legacy)).toBe(true);
		expect(LEGACY_CACHE_PATH_PATTERN.test(`.${retired}/state`)).toBe(true);
		expect(LEGACY_CACHE_PATH_PATTERN.test('.cache/delendai/foo')).toBe(
			false,
		);
	});

	it('flags a runtime source file that names the old path', () => {
		expect(
			findLegacyCachePaths([
				{
					path: 'packages/core/src/lib/x.ts',
					text: `const a = 1;\nconst p = '${legacy}';`,
				},
			]),
		).toEqual([
			{
				path: 'packages/core/src/lib/x.ts',
				line: 2,
				text: `const p = '${legacy}';`,
			},
		]);
	});

	it('lets migrators, cache migrations, tests and fixtures keep the literal', () => {
		for (const path of [
			'packages/core/src/lib/workspace-migration/migrators/a.migrator.ts',
			'packages/core/src/lib/cache/migrations/b.migration.ts',
			'packages/core/tests/src/lib/c.spec.ts',
			'plugins/x/tests/src/d.ts',
			'tools/scripts/lib/migration-fixtures/e.ts',
		])
			expect(isScanned(path)).toBe(false);
		expect(
			findLegacyCachePaths([
				{ path: 'packages/core/tests/a.ts', text: legacy },
			]),
		).toEqual([]);
	});

	it('ignores documents and files outside the scanned roots', () => {
		expect(isScanned('docs/delendai/proposals/done/a.md')).toBe(false);
		expect(isScanned('README.md')).toBe(false);
		expect(isScanned('tools/scripts/lint/a.script.ts')).toBe(true);
	});
});
