import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

import { sharedSetupFiles, workspaceAliases } from '../../vitest.shared';

const root = resolve(__dirname, '../..');

export default defineConfig({
	test: {
		// Measured in isolation on 2026-09-14: the slowest
		// test of this suite costs 89 ms (`set_test_policy persists an override that get then reports with sou...`).
		// A full run starts ~1,466 spec files at once, so a ceiling under
		// 6x a measured cost is a coin flip rather than a decision.
		testTimeout: 30_000,
		hookTimeout: 30_000,
		environment: 'node',
		include: ['tests/**/*.spec.ts'],
		setupFiles: sharedSetupFiles(root),
	},
	resolve: {
		alias: workspaceAliases(root),
	},
});
