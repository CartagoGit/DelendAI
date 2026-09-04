import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const workspaceRoot = dirname(fileURLToPath(import.meta.url));

const COVERAGE_INDEX_ROOTS = [
	'packages',
	'plugins',
	'apps/shared',
	'extensions/vscode',
	'tools/scripts/lib',
] as const;

const normalizeWorkspacePath = (pathValue: string): string =>
	relative(workspaceRoot, pathValue).split('\\').join('/');

const PURE_BARREL_STATEMENT =
	/^(?:export\s+\*\s+from\s+['"][^'"]+['"]|export\s+(?:type\s+)?\{[\s\S]+\}\s+from\s+['"][^'"]+['"]|export\s+type\s+\{[\s\S]+\}|import\s+type\s+[\s\S]+\s+from\s+['"][^'"]+['"])$/;

const listIndexFiles = (dir: string): string[] => {
	const entries = readdirSync(dir, { withFileTypes: true });
	const out: string[] = [];
	for (const entry of entries) {
		const entryPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...listIndexFiles(entryPath));
			continue;
		}
		if (entry.isFile() && entry.name === 'index.ts') {
			out.push(entryPath);
		}
	}
	return out;
};

const isPureBarrelIndex = (filePath: string): boolean => {
	const source = readFileSync(filePath, 'utf8')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\/\/.*$/gm, '')
		.trim();
	if (source.length === 0) return false;
	const statements = source
		.split(';')
		.map((statement) => statement.trim())
		.filter((statement) => statement.length > 0);
	return (
		statements.length > 0 &&
		statements.every((statement) => PURE_BARREL_STATEMENT.test(statement))
	);
};

const pureBarrelCoverageExcludes = COVERAGE_INDEX_ROOTS.flatMap((root) =>
	listIndexFiles(join(workspaceRoot, root))
		.filter(isPureBarrelIndex)
		.map(normalizeWorkspacePath),
);

export default defineConfig({
	resolve: {
		// r00045 S4: tell vitest's vite-node resolver to prefer the
		// `@delendai/source` condition. This makes every test resolve
		// `@delendai/<pkg>` against `<pkg>/src/index.ts` (via the
		// tsconfig path aliases + customConditions), never against the
		// `dist/` build artefact (now under `build/`).
		conditions: ['@delendai/source', 'node', 'import', 'default'],
	},
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
		// r00418 / UX request 2026-09-02:
		//   - `bail: 1` stops the run after the first failed test so a human
		//     (or agent) running `bun run test` sees the failure in real time
		//     instead of waiting for the whole 1500-test sweep. The
		//     noise-recovery loop ("run, see only summary, run again with
		//     `--reporter=verbose`") is gone.
		//   - NOTE on `fileParallelism`: vitest defaults to parallel test
		//     files. `bail` only stops NEW files from starting, so already
		//     in-flight files still run to completion. The trade-off is
		//     intentional — leaving parallelism on keeps CI fast and keeps
		//     the developer feedback loop <2s on the failing file. Tests
		//     that follow the failing file still get to run if they were
		//     scheduled before the bail event.
		//   - `reporters: ['verbose']` makes every test print its result
		//     line-by-line as it executes; a failing test surfaces its
		//     `expected/received` block on the FIRST run, not at the end.
		//   - All three can be overridden per invocation:
		//       `bun run test --bail 0 --reporter=default`
		//     when a host wants the exhaustive summary (e.g. CI coverage
		//     ratchet scripts that already triage failures offline).
		bail: 1,
		//   - the journal reporter writes every run (pass or fail) to
		//     `.cache/mcp-vertex/results/logs/test-runs.jsonl`, so the
		//     failures of a run that has already scrolled away can be read
		//     with `bun run test:failures` instead of running the suite a
		//     second time. It never prints and never throws.
		reporters: ['verbose', './tools/scripts/test/journal-reporter.ts'],
		// Coverage is a root concern (aggregated across every project). It only
		// runs under `--coverage` (i.e. `bun run test:coverage`), so the plain
		// `bun run test` stays fast.
		//
		// RATCHET POLICY (re-measured 2026-08-29, see docs/mcp-vertex/coverage-ratchet.md):
		// measured twice back-to-back — 83.23/70.29/84.05/84.90 then
		// 83.30/70.34/84.12/84.98 (statements/branches/functions/lines) — so
		// run-to-run drift on this suite is well under 0.1pt per metric.
		// Floors below are the lower of the two runs minus a flat 1.0pt
		// margin (~10x the observed drift), then floored to a whole number.
		// That is enough headroom to absorb ordinary noise without enough
		// slack to hide a real regression, unlike the previous 2-4pt gap.
		// To re-tighten: run `bun run test:coverage` (or, if a spec is
		// currently red and skipping the report, add
		// `--coverage.reportOnFailure=true` to the vitest invocation to force
		// the report anyway), read the "Coverage summary" percentages, and
		// set each threshold below to floor(measured − 1.0). Never lower a
		// threshold below its current value — that would mean coverage
		// regressed, which is a bug to fix, not a number to accommodate.
		coverage: {
			provider: 'v8',
			// Without this, coverage-v8 deletes the report on any test
			// failure, so the threshold check never runs and the job exits
			// red for the failing test instead — the gate silently skips
			// exactly when a coverage regression is most likely to be
			// arriving alongside broken tests.
			reportOnFailure: true,
			// r00004 S1: keep coverage out of the root — write under .cache/.
			reportsDirectory: '.cache/coverage',
			// t00002 S3: `.ts` only — `src/**` also matched marker files
			// (`plugins/issues/src/.gitkeep` starts with `#`), which the
			// v8 provider tried to parse as JS and crashed with a
			// PARSE_ERROR at pos 1 on every `test:coverage` run.
			// t00004: the gate covers the WHOLE runtime surface, not only
			// packages+plugins — apps/shared (12-language i18n source),
			// the VS Code extension and the tools/scripts library code
			// participate too. Pure `*.script.ts` entrypoints stay out
			// (process.exit orchestrators, exercised by the validate
			// gates that run them for real). t00006 brings `apps/web`
			// in selectively: pure TS logic, data builders, controller
			// helpers and generation scripts — not `.astro` pages nor the
			// generated/i18n leaf catalogues with little behavioural value.
			include: [
				'packages/*/src/**/*.ts',
				'plugins/*/src/**/*.ts',
				'apps/shared/src/**/*.ts',
				'apps/web/src/lib/**/*.ts',
				'apps/web/src/data/**/*.ts',
				'apps/web/src/components/ui/**/*.ts',
				'apps/web/src/i18n/tools/index.ts',
				'apps/web/scripts/**/*.ts',
				'extensions/vscode/src/**/*.ts',
				'tools/scripts/lib/**/*.ts',
			],
			exclude: [
				'**/*.spec.ts',
				'**/*.test.ts',
				...pureBarrelCoverageExcludes,
				'**/*.script.ts',
			],
			reporter: ['text-summary'],
			// t00004: re-measured after widening the scope — the global
			// numbers ROSE (83.45/70.78/82.63/84.90 on 2026-07-14) because
			// apps/shared and the extension are well covered.
			// 2026-08-29: re-measured again (see RATCHET POLICY note above) —
			// a large batch of new tests landed since t00004 and the old
			// floors (80/67/79/81) had drifted 2-4pt under the real numbers.
			// Tightened to measured − 1.0pt, floored. t00030 also adds
			// stricter branch floors for the core risk slices that carried
			// the audit's P0/P1 bug fixes.
			thresholds: {
				statements: 82,
				branches: 69,
				functions: 83,
				lines: 83,
				'packages/core/src/lib/plugins/**': {
					branches: 80,
				},
				'packages/core/src/lib/dry-run/**': {
					branches: 80,
				},
				'packages/core/src/lib/project/**': {
					branches: 80,
				},
			},
		},
	},
});
