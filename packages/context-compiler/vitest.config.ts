import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { sharedSetupFiles, workspaceAliases } from '../../vitest.shared';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

export default defineConfig({
	cacheDir: resolve(workspaceRoot, '.cache/vitest/packages-context-compiler'),
	resolve: { alias: workspaceAliases(workspaceRoot) },
	test: {
		// Measured in isolation on 2026-09-14: the slowest
		// test of this suite costs 65 ms (`createToolResultDeltaSink persists a result and returns a summary p...`).
		// A full run starts ~1,466 spec files at once, so a ceiling under
		// 6x a measured cost is a coin flip rather than a decision.
		testTimeout: 30_000,
		hookTimeout: 30_000,
		name: 'context-compiler',
		include: ['src/**/*.spec.ts', 'tests/**/*.spec.ts'],
		exclude: ['**/node_modules/**', '**/dist/**'],
		environment: 'node',
		globals: false,
		setupFiles: sharedSetupFiles(workspaceRoot),
	},
});
