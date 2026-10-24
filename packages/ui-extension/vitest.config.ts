import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { sharedSetupFiles, workspaceAliases } from '../../vitest.shared';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

/**
 * Vitest config for `apps/ide/`. Pure TS unit tests against the
 * `IHostAdapter` seam and the dashboard panel renderers; no DOM
 * environment is needed (panels return HTML strings, which we
 * assert via `regex`).
 */
export default defineConfig({
	resolve: {
		alias: workspaceAliases(workspaceRoot),
	},
	test: {
		// Measured in isolation on 2026-09-14: the slowest
		// test of this suite costs 82 ms (`buildKpiStrip renders all KPI totals correctly`).
		// A full run starts ~1,466 spec files at once, so a ceiling under
		// 6x a measured cost is a coin flip rather than a decision.
		testTimeout: 30_000,
		hookTimeout: 30_000,
		name: 'apps-ide',
		include: ['tests/**/*.spec.ts'],
		exclude: ['**/node_modules/**', '**/dist/**'],
		environment: 'node',
		globals: false,
		setupFiles: sharedSetupFiles(workspaceRoot),
	},
});
