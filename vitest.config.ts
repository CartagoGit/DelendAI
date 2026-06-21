import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// Projects run as their own vitest instances; the root shell walks
		// the listed globs to wire them up. Plugins that need to pause
		// their own runtime tests temporarily (e.g. while still in
		// `idea` status) should set `include: []` in their local
		// `vitest.config.ts` AND add a short comment explaining why —
		// see `plugins/audit/vitest.config.ts` for the historical
		// l99 opt-out pattern.
		projects: [
			'packages/*',
			'plugins/*',
			'examples/custom-plugin',
			'apps/web',
			'packages/ui-extension',
			'extensions/vscode',
			'tools/scripts',
		],
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
