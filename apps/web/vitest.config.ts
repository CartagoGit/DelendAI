import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { workspaceAliases } from '../../vitest.shared';

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
	resolve: { alias: workspaceAliases(workspaceRoot) },
	test: {
		name: 'apps-web',
		include: ['scripts/__tests__/**/*.spec.ts'],
		exclude: ['**/node_modules/**', '**/dist/**'],
		environment: 'node',
		globals: false,
	},
});
