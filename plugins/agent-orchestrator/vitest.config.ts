/**
 * vitest.config.ts — agent-orchestrator's test project.
 *
 * Uses `workspaceAliases` rather than a hand-written alias map. The
 * hand-written one listed only `@delendai/core/public`, which resolved
 * the direct import and nothing it pulls in: `public/index.ts` re-exports
 * `assembleCliConfig`, which imports `@delendai/state`, which had no
 * alias and therefore fell through to node resolution and the package's
 * built output. Every `dist` under `packages` is gitignored, so that
 * resolved on a machine which had built once and failed on every
 * clean checkout: all seven of this plugin's spec files died at
 * collection in CI with "Failed to resolve entry for package
 * @delendai/state", while passing locally.
 *
 * The shared alias map covers the whole workspace by source path, so a
 * transitive import cannot escape it.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { sharedSetupFiles, workspaceAliases } from '../../vitest.shared';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

export default defineConfig({
	resolve: { alias: workspaceAliases(workspaceRoot) },
	test: {
		name: 'agent-orchestrator',
		include: ['tests/**/*.spec.ts'],
		exclude: ['**/node_modules/**', '**/dist/**'],
		environment: 'node',
		setupFiles: sharedSetupFiles(workspaceRoot),
	},
});
