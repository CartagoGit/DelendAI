import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

import { sharedSetupFiles, workspaceAliases } from '../../vitest.shared';

const root = resolve(__dirname, '../..');

export default defineConfig({
	test: {
		// Measured in isolation on 2026-09-14: the slowest
		// test of this suite costs 23 ms (`test-convention plugin — options validation (r00003 S9-residual) re...`).
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
