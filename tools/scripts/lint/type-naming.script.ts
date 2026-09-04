#!/usr/bin/env bun
/**
 * type-naming.script.ts — enforce the "every exported type/interface is
 * `I`-prefixed" convention as a burn-down ratchet.
 *
 * Repo convention (user directive, 2026-08-27): every exported `type` and
 * `interface` starts with `I` (e.g. `IThing`, not `Thing`). The product
 * code has ~560+ pre-existing violations that predate strict enforcement
 * (`packages/core` alone holds roughly half), so a hard lint would be a
 * sea of red. Instead this is a **ratchet**, mirroring
 * `types-in-contracts.script.ts`: a JSON baseline records the current
 * violation count per file, and the lint fails only when a file's count
 * INCREASES or a NEW violating file appears. Existing debt is allowed,
 * new debt is blocked, and the baseline can only shrink over time.
 *
 * Usage:
 *   bun tools/scripts/lint/type-naming.script.ts            # check
 *   bun tools/scripts/lint/type-naming.script.ts --update   # rewrite baseline
 *   bun tools/scripts/lint/type-naming.script.ts --report   # counts only
 *
 * Detection catches what a line-anchored grep misses:
 *   - `export type Foo<T> = ...` (generics)
 *   - `export interface Foo extends Bar {` (multi-line bodies — only the
 *     declaration line itself needs to match, so this is naturally fine)
 *   - `export type { Foo, Bar as Baz } from '...'` re-export lists,
 *     including ones that span multiple lines
 *   - `.tsx` files
 *
 * A declaration is exempt when:
 *   - it lives in a `.spec.ts` / `.test.ts` file (test-only fixtures are
 *     not public API surface)
 *   - it lives in a `.d.ts` file (ambient declarations we did not author)
 *   - it lives in a `.generated.ts` file or under a `generated/` dir
 *     (machine-produced names, not a human choice)
 *   - it is a `export type { Foo } from '<bare-specifier>'` re-export of a
 *     genuine third-party package (we don't own that name so can't rename
 *     it) — internal path aliases (`.`, `/`, `#`, `@delendai/*`) do NOT
 *     count as third-party and are still linted.
 *
 * Deliberately NOT exempt (see c00157 proposal for the reasoning the user
 * asked to be recorded): zod-`z.infer<...>` type aliases, string-literal
 * union aliases, and React/Astro `*Props` types are all still in scope —
 * their names are ours to choose, so the ratchet still counts them as
 * violations to be paid down over time.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

/** Product-code + tooling roots scanned for the convention. */
const SCAN_GLOBS: readonly string[] = [
	'packages',
	'plugins',
	'apps',
	'extensions',
	'tools',
];

const BASELINE_REL = 'tools/scripts/lint/type-naming.baseline.json';

const EXCLUDE_DIR = new Set([
	'node_modules',
	'dist',
	'build',
	'.cache',
	'.git',
	'generated',
]);

const isExemptFile = (rel: string): boolean =>
	rel.endsWith('.spec.ts') ||
	rel.endsWith('.test.ts') ||
	rel.endsWith('.d.ts') ||
	rel.endsWith('.generated.ts') ||
	rel.includes('/generated/');

/** `IFoo`, `IHttp2Client`, `I18nStuff` is NOT compliant (needs a capital/digit right after I). */
const isPrefixed = (name: string): boolean => /^I[A-Z0-9]/.test(name);

/** Bare specifiers we treat as "internal", i.e. still linted. */
const isInternalSpecifier = (spec: string): boolean =>
	spec.startsWith('.') ||
	spec.startsWith('/') ||
	spec.startsWith('#') ||
	spec.startsWith('@delendai/');

const DECL_RE =
	/^export\s+(?:declare\s+)?(?:interface|type)\s+([A-Za-z_$][\w$]*)/gm;

const REEXPORT_RE =
	/export\s+(?:type\s+)?\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g;

/** Count `I`-prefix violations for exported type/interface declarations + type re-export lists. */
export const countViolations = (body: string): number => {
	let n = 0;

	DECL_RE.lastIndex = 0;
	for (const m of body.matchAll(DECL_RE)) {
		const name = m[1] ?? '';
		if (!isPrefixed(name)) n += 1;
	}

	REEXPORT_RE.lastIndex = 0;
	for (const m of body.matchAll(REEXPORT_RE)) {
		const inner = m[1] ?? '';
		const spec = m[2] ?? '';
		if (!isInternalSpecifier(spec)) continue; // third-party re-export: exempt
		const wholeClauseIsType = /^export\s+type\s*\{/.test(
			body.slice(
				Math.max(0, m.index - 'export type '.length),
				m.index + 20,
			),
		);
		for (const rawItem of inner.split(',')) {
			const item = rawItem.trim();
			if (item.length === 0) continue;
			const isTypeItem = wholeClauseIsType || /^type\s+/.test(item);
			if (!isTypeItem) continue;
			const cleaned = item.replace(/^type\s+/, '');
			const asMatch = cleaned.match(
				/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/,
			);
			const exportedName = asMatch ? asMatch[2] : cleaned.split(/\s+/)[0];
			if (exportedName && !isPrefixed(exportedName)) n += 1;
		}
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
		} else if (/\.tsx?$/.test(entry.name)) {
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
		const n = countViolations(readFileSync(join(root, rel), 'utf8'));
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
			`type-naming: baseline updated — ${Object.keys(current).length} files, ${total} violations.\n`,
		);
		return 0;
	}

	const baseline = loadBaseline(root);
	const regressions: string[] = [];
	for (const [rel, count] of Object.entries(current)) {
		const allowed = baseline[rel] ?? 0;
		if (count > allowed) {
			regressions.push(
				`  ${rel}: ${count} non-I-prefixed exported type/interface (baseline ${allowed}) — rename to \`I...\``,
			);
		}
	}

	const totalCur = Object.values(current).reduce((a, b) => a + b, 0);
	const totalBase = Object.values(baseline).reduce((a, b) => a + b, 0);

	if (args.has('--report')) {
		process.stderr.write(
			`type-naming: ${Object.keys(current).length} files / ${totalCur} violations (baseline ${totalBase}).\n`,
		);
		return 0;
	}

	if (regressions.length > 0) {
		process.stderr.write(
			`✖ type-naming: ${regressions.length} file(s) added non-I-prefixed exported types/interfaces:\n${regressions.join('\n')}\n\n` +
				`  Convention: every exported \`type\`/\`interface\` starts with \`I\` (e.g. \`IThing\`).\n` +
				`  If this is an intentional exception, run \`bun ${BASELINE_REL.replace('.baseline.json', '.script.ts')} --update\` to rebaseline (the baseline may only be raised deliberately).\n`,
		);
		return 1;
	}

	if (totalCur < totalBase) {
		process.stderr.write(
			`✓ type-naming: no new violations; debt shrank ${totalBase} → ${totalCur}. Run --update to lock in the win.\n`,
		);
		return 0;
	}
	process.stderr.write(
		`✓ type-naming: no new non-I-prefixed type/interface violations (${totalCur} baselined).\n`,
	);
	return 0;
};

if (import.meta.main) process.exit(main());
