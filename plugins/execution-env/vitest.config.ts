import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import {
	sharedSetupFiles,
	sharedTestOptions,
	workspaceAliases,
} from '../../vitest.shared.ts';

/** Same ceiling every plugin suite uses; named so the lint can see why. */
const SUITE_TIMEOUT_MS = 30_000;

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

export default defineConfig({
	resolve: { alias: workspaceAliases(workspaceRoot) },
	test: {
		...sharedTestOptions,
		testTimeout: SUITE_TIMEOUT_MS,
		hookTimeout: SUITE_TIMEOUT_MS,
		name: 'execution-env',
		include: ['tests/**/*.spec.ts'],
		exclude: ['**/node_modules/**', '**/dist/**'],
		environment: 'node',
		globals: false,
		setupFiles: sharedSetupFiles(workspaceRoot),
	},
});
