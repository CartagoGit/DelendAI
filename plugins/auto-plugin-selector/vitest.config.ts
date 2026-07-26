import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sharedSetupFiles, workspaceAliases } from '../../vitest.shared';

import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

export default defineConfig({
	root: workspaceRoot,
	resolve: { alias: workspaceAliases(workspaceRoot) },
	test: {
		testTimeout: 30000,
		hookTimeout: 30000,
		name: 'auto-plugin-selector',
		include: ['plugins/auto-plugin-selector/src/**/*.spec.ts'],
		exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
		environment: 'node',
		globals: false,
		setupFiles: sharedSetupFiles(workspaceRoot),
	},
});