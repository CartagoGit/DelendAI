import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { sharedSetupFiles, workspaceAliases } from '../../vitest.shared';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

export default defineConfig({
	resolve: { alias: workspaceAliases(workspaceRoot) },
	test: {
		// Healthcheck persistence goes through withFileMutex; under heavy
		// parallel-suite CPU load the mutex acquisition can exceed the 5s
		// default, so widen the timeout (a real hang still fails via the
		// assertions, which are the actual contract).
		testTimeout: 30000,
		hookTimeout: 30000,
		name: 'orchestrator-runner',
		include: ['tests/**/*.spec.ts'],
		exclude: ['**/node_modules/**', '**/dist/**'],
		environment: 'node',
		globals: false,
		setupFiles: sharedSetupFiles(workspaceRoot),
	},
});
