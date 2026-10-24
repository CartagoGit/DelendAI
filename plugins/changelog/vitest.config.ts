import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sharedSetupFiles, workspaceAliases } from '../../vitest.shared';

import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

export default defineConfig({
	resolve: {
		alias: workspaceAliases(workspaceRoot),
	},
	test: {
		// Measured in isolation on 2026-09-14: the slowest
		// test of this suite costs 13 ms (`parseConventionalCommit parses the supported conventional commit ty...`).
		// A full run starts ~1,466 spec files at once, so a ceiling under
		// 6x a measured cost is a coin flip rather than a decision.
		testTimeout: 30_000,
		hookTimeout: 30_000,
		include: ['src/**/*.spec.ts'],
		setupFiles: sharedSetupFiles(workspaceRoot),
	},
});
