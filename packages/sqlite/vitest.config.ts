import { defineConfig } from 'vitest/config';

import { sharedTestOptions } from '../../vitest.shared.ts';

export default defineConfig({
	test: {
		...sharedTestOptions,
		// Every spec here opens a real database under `bun test`
		// (`bun run test:sqlite`, BUN_OWNED_SPECS); vitest runs none.
		include: [],
		exclude: ['dist/**', 'node_modules/**'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json-summary'],
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.d.ts', 'src/**/*.spec.ts', 'tests/**/*'],
		},
	},
});
