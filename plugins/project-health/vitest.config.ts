import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { sharedSetupFiles, workspaceAliases } from '../../vitest.shared';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');
const TEST_TIMEOUT_MS = 30_000;

export default defineConfig({
	resolve: { alias: workspaceAliases(workspaceRoot) },
	test: {
		testTimeout: TEST_TIMEOUT_MS,
		hookTimeout: TEST_TIMEOUT_MS,
		name: 'project-health',
		include: ['tests/**/*.spec.ts'],
		exclude: ['**/node_modules/**', '**/dist/**'],
		environment: 'node',
		globals: false,
		setupFiles: sharedSetupFiles(workspaceRoot),
	},
});
