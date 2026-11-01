import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import {
	sharedSetupFiles,
	sharedTestOptions,
	workspaceAliases,
} from '../../vitest.shared.ts';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

export default defineConfig({
	resolve: {
		alias: workspaceAliases(workspaceRoot),
	},
	test: {
		...sharedTestOptions,
		// Measured in isolation on 2026-09-14: the slowest
		// test of this suite costs 24 ms (`refactor-rename tool refactor_rename returns a diff via injected pl...`).
		// A full run starts ~1,466 spec files at once, so a ceiling under
		// 6x a measured cost is a coin flip rather than a decision.
		testTimeout: 30_000,
		hookTimeout: 30_000,
		include: ['src/**/*.spec.ts'],
		setupFiles: sharedSetupFiles(workspaceRoot),
	},
});
