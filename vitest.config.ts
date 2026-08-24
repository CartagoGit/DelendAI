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
			// apps/shared and the extension are well covered. Floors sit a
			// few points under the measured values, as always.
			thresholds: {
				statements: 80,
				branches: 67,
				functions: 79,
				lines: 81,
			},
		},
	},
});
