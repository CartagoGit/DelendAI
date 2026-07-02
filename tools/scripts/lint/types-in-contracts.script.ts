#!/usr/bin/env bun
/**
 * types-in-contracts.script.ts — enforce the "types & constants live in
 * contracts/" convention as a burn-down ratchet.
 *
 * Repo convention: every exported `interface`/`type` belongs under a
 * `contracts/interfaces/*.interface.ts` file, and every exported
 * SCREAMING_SNAKE constant under `contracts/constants/*.constant.ts`.
 * The product code has ~329 pre-existing files that predate strict
 * enforcement, so a hard lint would be a sea of red. Instead this is a
 * **ratchet**: a JSON baseline records the current violation count per
 * file, and the lint fails only when a file's count INCREASES or a NEW
 * violating file appears. Existing debt is allowed; new debt is blocked
 * — so the swarm (or anyone) can no longer add inline types without
 * `validate` catching it, and the baseline can only shrink.
 *
 * Usage:
 *   bun tools/scripts/lint/types-in-contracts.script.ts            # check
 *   bun tools/scripts/lint/types-in-contracts.script.ts --update   # rewrite baseline
 *   bun tools/scripts/lint/types-in-contracts.script.ts --report   # counts only
 *
 * A file is exempt when it already lives in a `contracts/interfaces/`
 * or `contracts/constants/` dir, is a `*.interface.ts`/`*.constant.ts`
 * file, or is a spec/test/generated/dist file.
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

const BASELINE_REL = 'tools/scripts/lint/types-in-contracts.baseline.json';

const EXCLUDE_DIR = new Set([
	'node_modules',
	'dist',
	'build',
	'.cache',
	'.git',
	'generated',
	'tests',
	'__tests__',
]);

const isExemptFile = (rel: string): boolean =>
	rel.includes('/contracts/interfaces/') ||
	rel.includes('/contracts/constants/') ||
	rel.endsWith('.interface.ts') ||
	rel.endsWith('.constant.ts') ||
	rel.endsWith('.spec.ts') ||
	rel.endsWith('.test.ts') ||
	rel.endsWith('.d.ts');

/** An exported inline `interface`/`type`, or a SCREAMING_SNAKE `const`. */
const VIOLATION_RE =
	/^export\s+(?:interface|type)\s+\w|^export\s+const\s+[A-Z][A-Z0-9_]*\s*[:=]/;

const countViolations = (absPath: string): number => {
	let n = 0;
	const lines = readFileSync(absPath, 'utf8').split('\n');
	for (const line of lines) if (VIOLATION_RE.test(line)) n += 1;
	return n;
};

const walk = (root: string, absDir: string, out: string[]): void => {
	for (const entry of readdirSync(absDir, { withFileTypes: true })) {
		if (entry.name.startsWith('.') && entry.name !== '.') continue;
		const abs = join(absDir, entry.name);
		if (entry.isDirectory()) {
			if (EXCLUDE_DIR.has(entry.name)) continue;
			walk(root, abs, out);
		} else if (entry.name.endsWith('.ts')) {
			const rel = relative(root, abs).split('\\').join('/');
			if (!isExemptFile(rel)) out.push(rel);
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
			`types-in-contracts: baseline updated — ${Object.keys(current).length} files, ${total} violations.\n`,
		);
		return 0;
	}

	const baseline = loadBaseline(root);
	const regressions: string[] = [];
	for (const [rel, count] of Object.entries(current)) {
		const allowed = baseline[rel] ?? 0;
		if (count > allowed) {
			regressions.push(
				`  ${rel}: ${count} exported type/const (baseline ${allowed}) — move new ones to contracts/interfaces/ or contracts/constants/`,
			);
		}
	}

	const totalCur = Object.values(current).reduce((a, b) => a + b, 0);
	const totalBase = Object.values(baseline).reduce((a, b) => a + b, 0);

	if (args.has('--report')) {
		process.stderr.write(
			`types-in-contracts: ${Object.keys(current).length} files / ${totalCur} violations (baseline ${totalBase}).\n`,
		);
		return 0;
	}

	if (regressions.length > 0) {
		process.stderr.write(
			`✖ types-in-contracts: ${regressions.length} file(s) added inline exported types/constants outside contracts/:\n${regressions.join('\n')}\n\n` +
				`  Convention: interfaces/types → contracts/interfaces/*.interface.ts; SCREAMING_SNAKE consts → contracts/constants/*.constant.ts.\n` +
				`  If this is an intentional exception, run \`bun ${BASELINE_REL.replace('.baseline.json', '.script.ts')} --update\` to rebaseline (the baseline may only be raised deliberately).\n`,
		);
		return 1;
	}

	if (totalCur < totalBase) {
		process.stderr.write(
			`✓ types-in-contracts: no new violations; debt shrank ${totalBase} → ${totalCur}. Run --update to lock in the win.\n`,
		);
		return 0;
	}
	process.stderr.write(
		`✓ types-in-contracts: no new inline type/const violations (${totalCur} baselined).\n`,
	);
	return 0;
};

if (import.meta.main) process.exit(main());
