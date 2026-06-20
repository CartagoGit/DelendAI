import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// Projects run as their own vitest instances; the root shell walks
		// the listed globs to wire them up. Plugins still in `idea` (e.g.
		// `plugins/audit/` for p99) intentionally self-exclude runtime
		// tests, but the root shell still picks up their `*.spec.ts`
		// files unless we skip the entire project here. Remove the
		// `!plugins/audit` from the `projects` array (or restore the
		// simple globs) when p99 flips to `status: done` in
		// `docs/proposals/index.json`.
		projects: [
			'packages/*',
			'plugins/!(audit)',
			'examples/custom-plugin',
			'apps/web',
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
