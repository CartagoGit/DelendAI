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

		const paths = tsconfig.compilerOptions?.paths ?? {};

		// Every local alias entry must be present (the local aliases are
		// the contract this spec guards). Extra entries are allowed —
		// f00047 S6 added the `@mcp-vertex/*` workspace aliases, which
		// are wired in `astro.config.mjs#vite.resolve.alias` for runtime
		// resolution and reflected here for the type-checker. The contract
		// is that local aliases are present; workspace aliases are a
		// superset.
		for (const [alias, expected] of Object.entries(TS_CONFIG_PATHS)) {
			expect(paths[alias]).toEqual(expected);
		}
	});
});
