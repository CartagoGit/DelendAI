import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

import { sharedSetupFiles, workspaceAliases } from '../../vitest.shared';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

/**
 * Vitest config for `@delendai/test-kit` — specs for the helper
 * itself (the helper's own type-safety guarantees are exercised via
 * `.spec.ts` files, since `tsc` — not a runtime assertion — is what
 * proves the compile-time behaviour).
 */
export default defineConfig({
	resolve: { alias: workspaceAliases(workspaceRoot) },
	test: {
		// Measured in isolation on 2026-09-14: the slowest
		// test of this suite costs 11 ms (`createFakeToolServer routes registerTool calls to onRegisterTool wi...`).
		// A full run starts ~1,466 spec files at once, so a ceiling under
		// 6x a measured cost is a coin flip rather than a decision.
		testTimeout: 30_000,
		hookTimeout: 30_000,
		name: 'test-kit',
		include: ['tests/**/*.spec.ts'],
		exclude: ['**/node_modules/**', '**/dist/**'],
		environment: 'node',
		globals: false,
		setupFiles: sharedSetupFiles(workspaceRoot),
	},
});
