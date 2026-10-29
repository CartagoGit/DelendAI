import { defineConfig } from 'vitest/config';

import { sharedTestOptions } from '../../vitest.shared.ts';

export default defineConfig({
	test: {
		...sharedTestOptions,
		// Bun-only: the driver opens a `bun:sqlite` database, a Bun builtin
		// with no node resolution, so these specs can never pass under
		// vitest. `bun run test:sqlite` runs them and CI runs that script as
		// its own step.
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
