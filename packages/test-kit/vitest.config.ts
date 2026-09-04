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
		name: 'test-kit',
		include: ['tests/**/*.spec.ts'],
		exclude: ['**/node_modules/**', '**/dist/**'],
		environment: 'node',
		globals: false,
		setupFiles: sharedSetupFiles(workspaceRoot),
	},
});
