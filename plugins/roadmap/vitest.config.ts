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
		// Isolated until these specs stop depending on a fresh module
		// registry (they fail when run after another file): roadmap-bump-intent.service.spec.ts.
		isolate: true,
		testTimeout: SUITE_TIMEOUT_MS,
		hookTimeout: SUITE_TIMEOUT_MS,
		name: 'roadmap',
		include: ['src/**/*.spec.ts', 'tests/**/*.spec.ts'],
		exclude: ['**/node_modules/**', '**/dist/**'],
		environment: 'node',
		globals: false,
		setupFiles: sharedSetupFiles(workspaceRoot),
	},
});
