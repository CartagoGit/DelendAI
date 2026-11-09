import { describe, expect, it } from 'vitest';

import { exportDelta, reexportSurface } from './export-delta';

const resolve = (specifier: string): string | undefined =>
	specifier.startsWith('./') ? `src/${specifier.slice(2)}.ts` : undefined;

const BARREL = `#!/usr/bin/env node
import { runCli } from './lib/cli/run-cli';
export { assembleCliConfig } from './lib/cli/assemble';
export { a, b } from './lib/shared/ab';
export type { IThing } from './lib/shared/thing';
if (import.meta.main) void runCli();
`;

describe('reexportSurface', () => {
	it('[<7ms] reads a barrel as the names it re-exports, entry guard and all', () => {
		expect(
			[...(reexportSurface(BARREL, resolve)?.keys() ?? [])].sort(),
		).toEqual(['IThing', 'a', 'assembleCliConfig', 'b']);
	});

	it('[<6ms] is undefined for a file that declares something itself', () => {
		expect(
			reexportSurface(
				`export const own = 1;\nexport { a } from './x';`,
				resolve,
			),
		).toBeUndefined();
	});
});

describe('exportDelta', () => {
	it('[<6ms] names only the export a change added to a barrel', () => {
		const after = BARREL.replace(
			"export { a, b } from './lib/shared/ab';",
			"export { a, b } from './lib/shared/ab';\nexport { fresh } from './lib/shared/fresh';",
		);
		expect(exportDelta(BARREL, after, resolve)).toEqual(new Set(['fresh']));
	});

	it('[<6ms] names a removed export and a re-pointed one', () => {
		const after = BARREL.replace(
			"export { assembleCliConfig } from './lib/cli/assemble';\n",
			'',
		).replace('./lib/shared/ab', './lib/shared/other');
		expect(exportDelta(BARREL, after, resolve)).toEqual(
			new Set(['assembleCliConfig', 'a', 'b']),
		);
	});

	it('[<5ms] is empty when only the order of the exports changed', () => {
		const after = BARREL.replace(
			"export { assembleCliConfig } from './lib/cli/assemble';\nexport { a, b } from './lib/shared/ab';",
			"export { a, b } from './lib/shared/ab';\nexport { assembleCliConfig } from './lib/cli/assemble';",
		);
		expect(exportDelta(BARREL, after, resolve)).toEqual(new Set());
	});

	it('[<6ms] cannot bound an export-star and answers all', () => {
		const after = `${BARREL}export * from './lib/shared/all';\n`;
		expect(exportDelta(BARREL, after, resolve)).toBe('*');
	});

	it('[<5ms] has no delta for a new file or one that declares something', () => {
		expect(exportDelta(undefined, BARREL, resolve)).toBeUndefined();
		expect(
			exportDelta(BARREL, `${BARREL}export const own = 1;`, resolve),
		).toBeUndefined();
	});
});
