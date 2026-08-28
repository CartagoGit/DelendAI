#!/usr/bin/env bun
/**
 * effect-boundaries.script.ts — AUD-D01 (x00288): the declared effects
 * layer (`IToolEffect = 'write' | 'spawn' | 'network' | 'destructive'`,
 * `ctx.effects`, `guardEffectCapability`, `runWithDryRunGate`) is
 * advisory, not load-bearing, because nothing stops a plugin from
 * importing `node:child_process` / `node:fs` / `node:net` / `node:http`
 * directly and performing the side effect without ever routing through
 * the layer or declaring it. `capabilities-declared.script.ts` only
 * detects `ctx.capabilities.<group>.<action>(...)` textual patterns, so
 * a plugin that skips the layer entirely is invisible to it and the
 * gate reports false success (`✓ 51/51`).
 *
 * This is the inverted gate the finding calls for: instead of "declare
 * what you route", it is "you may not import the sensitive builtin at
 * all from plugin source" — a ratchet, following the exact idiom of
 * `types-in-contracts.script.ts` (a JSON baseline of `{ relPath: count
 * }`, `--update` rewrites it, the gate fails only on a NEW/INCREASED
 * count per file, hermetic regex heuristics, no AST). Homogeneity with
 * that script's structure and CLI shape is deliberate.
 *
 * Sensitive modules (both `node:`-prefixed and bare spellings):
 *   child_process, fs, fs/promises, net, http, https, dgram
 *
 * Authorized adapters
 * --------------------
 * The audit's own suggested waiver mechanism is the file-level comment
 * marker convention `capabilities-declared.script.ts` already uses
 * (`// capabilities-pending: ...` / `// capabilities-migration-due:
 * ...`, documented there as "per-FILE"). This script reuses that idiom
 * rather than inventing a `*.waivers.json` sidecar (the pattern used by
 * `style-integrity` / `shared-ui-ratchet`): an authorized adapter is a
 * file that carries the marker
 *
 *   // effect-boundary-authorized: <reason, >= 12 chars>
 *
 * anywhere in its source. The whole file is exempt from counting when
 * the marker is present with a real reason — matching the audit's own
 * proposed convention ("una allowlist ... el patrón capabilities-pending
 * ... que el repo ya tiene") instead of introducing a second, competing
 * waiver format for the same problem.
 *
 * Usage:
 *   bun tools/scripts/lint/effect-boundaries.script.ts            # check
 *   bun tools/scripts/lint/effect-boundaries.script.ts --update   # rewrite baseline
 *   bun tools/scripts/lint/effect-boundaries.script.ts --report   # counts only
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

/** Only plugin source is in scope — `plugins/<name>/src/**` (per AUD-D01). */
const SCAN_GLOBS: readonly string[] = ['plugins'];

const BASELINE_REL = 'tools/scripts/lint/effect-boundaries.baseline.json';

const EXCLUDE_DIR = new Set([
	'node_modules',
	'dist',
	'build',
	'.cache',
	'.git',
	'generated',
	// Mirrors `types-in-contracts.script.ts`'s EXCLUDE_DIR: test-harness
	// trees (e.g. `plugins/proposals/tests/src/**`) are not shipped
	// plugin source even though they nest a `src/` dir of their own —
	// they exist to spin up test fixtures, not to run in production.
	'tests',
	'__tests__',
]);

/** Minimum length of the reason text after the marker — mirrors the
 * repo's existing `MIN_WAIVER_LENGTH` convention in
 * `style-integrity.script.ts` / `shared-ui-ratchet.script.ts`: a waiver
 * must be a documented reason, not a "TODO". */
export const MIN_AUTHORIZATION_LENGTH = 12;

const AUTHORIZATION_RE = /effect-boundary-authorized:\s*(.{12,})/;

/** A file is only in scope when it lives under a plugin's `src/` tree
 * and is not a spec/test/generated/declaration file — same exemption
 * shape as `types-in-contracts.script.ts`. */
const isExemptFile = (rel: string): boolean =>
	!rel.includes('/src/') ||
	rel.endsWith('.spec.ts') ||
	rel.endsWith('.test.ts') ||
	rel.endsWith('.d.ts') ||
	rel.endsWith('.generated.ts');

/** Both `node:`-prefixed and bare spellings of the sensitive builtins.
 * `fs/promises` is listed before the bare `fs` alternative so a
 * specifier like `node:fs/promises` is matched by the more specific
 * branch first (both are flagged either way; order only affects which
 * capture wins, not whether the line is flagged). */
const SENSITIVE_MODULE_RE =
	/(?:from\s+|require\(\s*)['"](?:node:)?(child_process|fs\/promises|fs|net|https?|dgram)['"]/;

/**
 * Is this file an authorized adapter? Pure — operates on already-read
 * file content, no I/O. Exported so the spec can exercise it directly.
 */
export const isAuthorizedAdapter = (body: string): boolean =>
	AUTHORIZATION_RE.test(body);

/**
 * Count sensitive-builtin import/require lines in a single file body.
 * Returns 0 for an authorized adapter regardless of how many sensitive
 * imports it contains — the marker is a whole-file opt-in, matching
 * `capabilities-declared.script.ts`'s own "the whitelist is per-FILE"
 * design. Pure.
 */
export const countEffectBoundaryViolations = (body: string): number => {
	if (isAuthorizedAdapter(body)) return 0;
	let n = 0;
	for (const line of body.split('\n')) {
		if (SENSITIVE_MODULE_RE.test(line)) n += 1;
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
		} else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
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
		const n = countEffectBoundaryViolations(
			readFileSync(join(root, rel), 'utf8'),
		);
		if (n > 0) result[rel] = n;
	}
	return result;
};

const loadBaseline = (root: string): Record<string, number> => {
	const abs = join(root, BASELINE_REL);
	if (!existsSync(abs)) return {};
	return JSON.parse(readFileSync(abs, 'utf8')) as Record<string, number>;
};

/** `{ relPath: count }` grouped down to `{ pluginName: fileCount }` —
 * used only for the human-readable report; the ratchet itself operates
 * on the per-file baseline like `types-in-contracts.script.ts`. */
export const groupByPlugin = (
	current: Record<string, number>,
): Record<string, number> => {
	const out: Record<string, number> = {};
	for (const rel of Object.keys(current)) {
		const match = /^plugins\/([^/]+)\//.exec(rel);
		const plugin = match?.[1] ?? '(unknown)';
		out[plugin] = (out[plugin] ?? 0) + 1;
	}
	return out;
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
			`effect-boundaries: baseline updated — ${Object.keys(current).length} files, ${total} violations.\n`,
		);
		return 0;
	}

	const baseline = loadBaseline(root);
	const regressions: string[] = [];
	for (const [rel, count] of Object.entries(current)) {
		const allowed = baseline[rel] ?? 0;
		if (count > allowed) {
			regressions.push(
				`  ${rel}: ${count} direct sensitive-builtin import(s) (baseline ${allowed}) — route through ctx.effects instead, or mark an authorized adapter with "// effect-boundary-authorized: <reason>"`,
			);
		}
	}

	const totalCur = Object.values(current).reduce((a, b) => a + b, 0);
	const totalBase = Object.values(baseline).reduce((a, b) => a + b, 0);

	if (args.has('--report')) {
		const byPlugin = groupByPlugin(current);
		const pluginLines = Object.entries(byPlugin)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([p, n]) => `    ${p}: ${n} file(s)`)
			.join('\n');
		process.stderr.write(
			`effect-boundaries: ${Object.keys(current).length} files / ${totalCur} violations across ${Object.keys(byPlugin).length} plugin(s) (baseline ${totalBase}).\n${pluginLines}\n`,
		);
		return 0;
	}

	if (regressions.length > 0) {
		process.stderr.write(
			`✖ effect-boundaries: ${regressions.length} file(s) added new direct imports of sensitive Node builtins in plugins/**/src/**:\n${regressions.join('\n')}\n\n` +
				`  Convention: plugin effects (spawn/fs/net/http) must go through ctx.effects, not a direct node:child_process/fs/net/http(s)/dgram import.\n` +
				`  If this is a genuine, reviewed adapter, add "// effect-boundary-authorized: <reason>" (>= ${MIN_AUTHORIZATION_LENGTH} chars) to the file instead of baselining it.\n` +
				`  If this is intentional debt, run \`bun ${BASELINE_REL.replace('.baseline.json', '.script.ts')} --update\` to rebaseline (the baseline may only be raised deliberately).\n`,
		);
		return 1;
	}

	if (totalCur < totalBase) {
		process.stderr.write(
			`✓ effect-boundaries: no new violations; debt shrank ${totalBase} → ${totalCur}. Run --update to lock in the win.\n`,
		);
		return 0;
	}
	process.stderr.write(
		`✓ effect-boundaries: no new direct sensitive-builtin imports (${totalCur} baselined).\n`,
	);
	return 0;
};

if (import.meta.main) process.exit(main());
