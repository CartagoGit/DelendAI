import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

import { sharedSetupFiles, workspaceAliases } from '../../vitest.shared';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

export default defineConfig({
	cacheDir: resolve(workspaceRoot, '.cache/vitest/packages-core-f00418-s1'),
	resolve: { alias: workspaceAliases(workspaceRoot) },
	test: {
		testTimeout: 30000,
		hookTimeout: 30000,
		name: 'core-f00418-s1',
		include: ['src/**/*.spec.ts'],
		exclude: ['**/node_modules/**', '**/dist/**'],
		environment: 'node',
		globals: false,
		setupFiles: sharedSetupFiles(workspaceRoot),
	},
});
