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
			'docs/mcp-vertex/examples/custom-plugin',
			'apps/web',
			'apps/shared',
			'packages/ui-extension',
			'extensions/vscode',
			'tools',
		],
		// Coverage is a root concern (aggregated across every project). It only
		// runs under `--coverage` (i.e. `bun run test:coverage`), so the plain
		// `bun run test` stays fast. The thresholds are a no-regression gate set
		// a few points under the current numbers — tighten them as coverage grows.
		coverage: {
			provider: 'v8',
			// r00004 S1: keep coverage out of the root — write under .cache/.
			reportsDirectory: '.cache/coverage',
			all: true,
			// t00002 S3: `.ts` only — `src/**` also matched marker files
			// (`plugins/issues/src/.gitkeep` starts with `#`), which the
			// v8 provider tried to parse as JS and crashed with a
			// PARSE_ERROR at pos 1 on every `test:coverage` run.
			// t00004: the gate covers the WHOLE runtime surface, not only
			// packages+plugins — apps/shared (12-language i18n source),
			// the VS Code extension and the tools/scripts library code
			// participate too. Pure `*.script.ts` entrypoints stay out
			// (process.exit orchestrators, exercised by the validate
			// gates that run them for real); apps/web stays out until
			// the v8 provider maps .astro sanely.
			include: [
				'packages/*/src/**/*.ts',
				'plugins/*/src/**/*.ts',
				'apps/shared/src/**/*.ts',
				'extensions/vscode/src/**/*.ts',
				'tools/scripts/lib/**/*.ts',
			],
			exclude: [
				'**/*.spec.ts',
				'**/*.test.ts',
				'**/index.ts',
				'**/*.script.ts',
			],
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
