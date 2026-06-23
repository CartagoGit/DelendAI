import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { sharedSetupFiles, workspaceAliases } from '../../vitest.shared';
import { LOCAL_ALIASES } from './scripts/lib/local-aliases.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

/**
 * Vitest config for `apps/web/`. The root `vitest.config.ts` aggregates
 * this project alongside the core packages and plugins. Only the
 * generation/utility scripts (gen-skills, gen-capabilities) and the
 * `__tests__/` folder are picked up here — Astro components/pages
 * are not unit-tested today.
 */
export default defineConfig({
	resolve: {
		alias: [
			...workspaceAliases(workspaceRoot),
			...Object.entries(LOCAL_ALIASES).map(([find, replacement]) => ({
				find,
				replacement,
			})),
		],
	},
	test: {
		name: 'apps-web',
		include: [
			'scripts/__tests__/**/*.spec.ts',
			// f00030 S3 — pure helpers under `src/lib/` are unit-tested here.
			'tests/**/*.spec.ts',
		],
		exclude: ['**/node_modules/**', '**/dist/**'],
		environment: 'node',
		globals: false,
		setupFiles: sharedSetupFiles(workspaceRoot),
	},
});
