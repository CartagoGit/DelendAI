import { defineConfig } from 'vitest/config';

/**
 * Standalone vitest project for `tools/scripts/`. Walks every `*.spec.ts`
 * under that tree. Wired up by the root `vitest.config.ts#projects`.
 */
export default defineConfig({
	test: {
		include: ['**/*.spec.ts'],
		exclude: ['**/node_modules/**', '**/dist/**'],
	},
});
