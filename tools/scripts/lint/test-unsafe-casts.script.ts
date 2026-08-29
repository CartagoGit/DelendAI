#!/usr/bin/env bun
/**
 * test-unsafe-casts.script.ts — enforce "use `@mcp-vertex/test-kit`
 * instead of an unsafe cast" in test files, as a burn-down ratchet.
 *
 * c00158: a repo-wide sweep measured 196 `as unknown` occurrences
 * across 120 test files — and, once the sweep widened to the sibling
 * smells a bare `as unknown` grep misses, a SECOND, LARGER smell:
 * `as never` (208 occurrences across 115 files), used at exactly the
 * same "force a fake through a real parameter type" call sites, just
 * spelled differently. `as any` and `@ts-expect-error` (used to force
 * a bad shape through, not to test that the type system rejects one)
 * round out the tracked set. Rewriting all ~400 existing occurrences
 * in one slice was not attempted — this is a ratchet exactly like
 * `types-in-contracts.script.ts`: a JSON baseline records the current
 * count per file, and the lint fails only when a file's count
 * INCREASES or a new violating file appears. Existing debt is
 * allowed; new debt is blocked, and the baseline can only shrink.
 *
 * Usage:
 *   bun tools/scripts/lint/test-unsafe-casts.script.ts            # check
 *   bun tools/scripts/lint/test-unsafe-casts.script.ts --update   # rewrite baseline
 *   bun tools/scripts/lint/test-unsafe-casts.script.ts --report   # counts only
 *
 * Scope mirrors `types-in-contracts.script.ts`: `packages/`,
 * `plugins/`, `apps/`, `extensions/` (`tools/` scripts are exempt —
 * several of its own lint specs use `as any`/`as unknown` as STRING
 * LITERAL FIXTURES describing violations for another lint to find,
 * not as real casts; scanning them would be pure noise).
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

/** Product-code roots scanned for the convention (tools/ scripts are exempt). */
const SCAN_GLOBS: readonly string[] = [
	'packages',
	'plugins',
	'apps',
	'extensions',
];

const BASELINE_REL = 'tools/scripts/lint/test-unsafe-casts.baseline.json';

const EXCLUDE_DIR = new Set([
	'node_modules',
	'dist',
	'build',
	'.cache',
	'.git',
]);

const isTestFile = (rel: string): boolean =>
	rel.endsWith('.spec.ts') ||
	rel.endsWith('.spec.tsx') ||
	rel.endsWith('.test.ts') ||
	rel.endsWith('.test.tsx');

/**
 * Every pattern this ratchet tracks. Each is a real escape hatch from
 * the type checker used (in the dominant case) to force a hand-rolled
 * fake through a real parameter type — `@mcp-vertex/test-kit`'s
 * `fakePartial` / `createFakeToolServer` / `asArray` replace the
 * majority of call sites; the rest are documented, honest exceptions
 * (see the c00158 proposal's Non-goals).
 */
const VIOLATION_PATTERNS: readonly RegExp[] = [
	/\bas unknown\b/g,
	/\bas any\b/g,
	/\bas never\b/g,
	/@ts-expect-error/g,
];

const countViolations = (absPath: string): number => {
	const content = readFileSync(absPath, 'utf8');
	let n = 0;
	for (const pattern of VIOLATION_PATTERNS) {
		const matches = content.match(pattern);
		if (matches !== null) n += matches.length;
	}
	return n;
};

const walk = (root: string, absDir: string, out: string[]): void => {
	for (const entry of readdirSync(absDir, { withFileTypes: true })) {
		if (entry.name.startsWith('.') && entry.name !== '.') continue;
		const abs = join(absDir, entry.name);
		if (entry.isDirectory()) {
			if (EXCLUDE_DIR.has(entry.name)) continue;
			walk(root, abs, out);
		} else if (entry.isFile()) {
			const rel = relative(root, abs).split('\\').join('/');
			if (isTestFile(rel)) out.push(rel);
		}
	}
};

/** Scan the repo and return `{ relPath: violationCount }` for violators. */
export const scanViolations = (root: string): Record<string, number> => {
	const files: string[] = [];
	for (const glob of SCAN_GLOBS) {
		const abs = join(root, glob);
		if (existsSync(abs)) walk(root, abs, files);
	}
	const result: Record<string, number> = {};
	for (const rel of files.sort()) {
		const n = countViolations(join(root, rel));
		if (n > 0) result[rel] = n;
	}
	return result;
};

const loadBaseline = (root: string): Record<string, number> => {
	const abs = join(root, BASELINE_REL);
	if (!existsSync(abs)) return {};
	return JSON.parse(readFileSync(abs, 'utf8')) as Record<string, number>;
};

const main = (): number => {
	const root = repoRoot();
	const args = new Set(process.argv.slice(2));
	const current = scanViolations(root);

	if (args.has('--update')) {
		writeFileSync(
			join(root, BASELINE_REL),
			`${JSON.stringify(current, null, '\t')}\n`,
			'utf8',
		);
		const total = Object.values(current).reduce((a, b) => a + b, 0);
		process.stderr.write(
			`test-unsafe-casts: baseline updated — ${Object.keys(current).length} files, ${total} violations.\n`,
		);
		return 0;
	}

	const baseline = loadBaseline(root);
	const regressions: string[] = [];
	for (const [rel, count] of Object.entries(current)) {
		const allowed = baseline[rel] ?? 0;
		if (count > allowed) {
			regressions.push(
				`  ${rel}: ${count} unsafe cast(s) (baseline ${allowed}) — use @mcp-vertex/test-kit (fakePartial / createFakeToolServer / asArray) instead of as unknown/as any/as never/@ts-expect-error.`,
			);
		}
	}

	const totalCur = Object.values(current).reduce((a, b) => a + b, 0);
	const totalBase = Object.values(baseline).reduce((a, b) => a + b, 0);

	if (args.has('--report')) {
		process.stderr.write(
			`test-unsafe-casts: ${Object.keys(current).length} files / ${totalCur} violations (baseline ${totalBase}).\n`,
		);
		return 0;
	}

	if (regressions.length > 0) {
		process.stderr.write(
			`✖ test-unsafe-casts: ${regressions.length} file(s) added new unsafe casts in tests:\n${regressions.join('\n')}\n\n` +
				`  Convention: build fakes with @mcp-vertex/test-kit instead of \`as unknown\`/\`as any\`/\`as never\`/\`@ts-expect-error\`-to-force-a-bad-shape.\n` +
				`  If this is a documented, honest exception (see c00158's Non-goals for the known categories), run \`bun ${BASELINE_REL.replace('.baseline.json', '.script.ts')} --update\` to rebaseline (the baseline may only be raised deliberately).\n`,
		);
		return 1;
	}

	if (totalCur < totalBase) {
		process.stderr.write(
			`✓ test-unsafe-casts: no new violations; debt shrank ${totalBase} → ${totalCur}. Run --update to lock in the win.\n`,
		);
		return 0;
	}
	process.stderr.write(
		`✓ test-unsafe-casts: no new unsafe casts in tests (${totalCur} baselined).\n`,
	);
	return 0;
};

if (import.meta.main) process.exit(main());
