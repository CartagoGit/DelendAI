import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT, TS_CONFIG_PATHS } from '../lib/local-aliases.mjs';

describe('local aliases', () => {
	it('keeps apps/web/tsconfig.json paths in sync with local-aliases.mjs', async () => {
		const raw = await readFile(
			join(REPO_ROOT, 'apps/web/tsconfig.json'),
			'utf8',
		);
		const tsconfig = JSON.parse(raw) as {
			compilerOptions?: {
				paths?: Record<string, readonly string[]>;
			};
		};

		expect(tsconfig.compilerOptions?.paths).toEqual(TS_CONFIG_PATHS);
	});
});
