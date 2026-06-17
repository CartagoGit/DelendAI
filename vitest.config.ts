import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		projects: ['packages/*', 'plugins/*'],
		// Coverage is a root concern (aggregated across every project). It only
		// runs under `--coverage` (i.e. `bun run test:coverage`), so the plain
		// `bun run test` stays fast. The thresholds are a no-regression gate set
		// a few points under the current numbers — tighten them as coverage grows.
		coverage: {
			provider: 'v8',
			all: true,
			include: ['packages/*/src/**', 'plugins/*/src/**'],
			exclude: ['**/*.spec.ts', '**/*.test.ts', '**/index.ts'],
			reporter: ['text-summary'],
			thresholds: {
				statements: 72,
				branches: 55,
				functions: 75,
				lines: 73,
			},
		},
	},
});
