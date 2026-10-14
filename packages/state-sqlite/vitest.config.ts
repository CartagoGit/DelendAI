import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// Bun-only, for the same reason as packages/proposals-sqlite: the
		// driver opens a `bun:sqlite` database, and `bun:sqlite` is a Bun
		// builtin with no node resolution, so these specs can never pass
		// under vitest. They run under `bun run test:sqlite` (22 tests),
		// which CI runs as its own step.
		include: [],
		exclude: ['dist/**', 'node_modules/**'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json-summary'],
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.d.ts', 'src/**/*.spec.ts'],
		},
	},
});
