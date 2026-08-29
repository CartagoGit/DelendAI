#!/usr/bin/env bun
/**
 * biome-baseline.script.ts — x00281: `bun run lint` invoked `biome ci
 * extensions/vscode`, even though `biome.json` already declares
 * `files.includes: ["**", ...exclusions]` for the whole monorepo. The
 * three CI callers that all funnel through `bun run lint`
 * (`ci.yml#lint-biome`, `tier1.yml#affected-lint`,
 * `tier2.yml#lint-full`) were therefore only ever linting one
 * extension's worth of source, while `packages/`, `plugins/`,
 * `tools/`, and `apps/` accumulated real Biome debt unseen: measured
 * 2026-08-29, `bunx biome ci packages plugins tools apps` reports
 * 3380 files / 45 errors / 118 warnings / 127 infos.
 *
 * Reformatting the whole tree in one `biome ci . --write` PR was
 * rejected (see the proposal's "why this design" — this repo has a
 * documented history of merged codemods silently corrupting files
 * outside their declared scope in large automated diffs). Instead
 * this is a ratchet, following the exact idiom of
 * `types-in-contracts.script.ts` / `type-naming.script.ts` /
 * `test-unsafe-casts.script.ts`: a JSON baseline records today's
 * violation count, and the gate fails only when a count INCREASES or
 * a brand-new category of violation appears. Existing debt is
 * allowed; new debt is blocked; the baseline can only shrink.
 *
 * Unlike those three, the baseline here is keyed by Biome **rule
 * category** (`lint/complexity/noUselessTernary`, `format`, ...), not
 * by file — the proposal calls out that per-file granularity across
 * 3380 files would produce a baseline with hundreds of noisy entries,
 * whereas per-category collapses the same debt into a few dozen
 * meaningful buckets. Biome's own `error`-severity diagnostics are
 * pulled out of the per-category buckets into one `__errors__` total:
 * those are real bugs in the emitted code (`noAssignInExpressions`,
 * format drift treated as a hard failure by `biome ci`), not style
 * debt, and are meant to be burned down to zero as a follow-up slice
 * rather than tracked indefinitely like a warning/info bucket.
 *
 * Usage:
 *   bun tools/scripts/lint/biome-baseline.script.ts            # check
 *   bun tools/scripts/lint/biome-baseline.script.ts --update   # rewrite baseline
 *   bun tools/scripts/lint/biome-baseline.script.ts --report   # counts only
 *
 * Scope: `packages plugins tools apps extensions` — the same tree
 * `biome.json`'s `files.includes` already declares, minus its own
 * exclusions. `extensions/vscode` is folded in here rather than kept
 * as the isolated `biome ci extensions/vscode` invocation it used to
 * be; `check:i18n` for that extension remains a separate step in
 * `bun run lint`, untouched by this script.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

/** Tree scanned — mirrors `biome.json`'s `files.includes` root. */
const SCAN_DIRS: readonly string[] = [
	'packages',
	'plugins',
	'tools',
	'apps',
	'extensions',
];

const BASELINE_REL = 'tools/scripts/lint/biome-baseline.json';

/** The single bucket for Biome `error`-severity diagnostics (see file header). */
const ERRORS_KEY = '__errors__';

export interface IBiomeDiagnostic {
	readonly severity: string;
	readonly category?: string;
	readonly message?: string;
}

export interface IBiomeSummary {
	readonly errors: number;
	readonly warnings: number;
	readonly infos: number;
}

export interface IBiomeCiResult {
	readonly summary: IBiomeSummary;
	readonly diagnostics: readonly IBiomeDiagnostic[];
}

/** Strips ANSI escape sequences Biome emits around `--reporter=json` output. */
export const stripAnsi = (raw: string): string =>
	// biome-ignore lint/suspicious/noControlCharactersInRegex: matching the ESC control byte IS the point of this helper.
	raw.replace(/\x1b\[[0-9;]*m/g, '');

/**
 * Parses `biome ci --reporter=json` stdout. Biome wraps the JSON body in
 * ANSI reset codes even when stdout is not a TTY, so this strips those
 * before parsing rather than assuming a bare JSON document.
 */
export const parseBiomeJsonOutput = (raw: string): IBiomeCiResult => {
	const cleaned = stripAnsi(raw).trim();
	return JSON.parse(cleaned) as IBiomeCiResult;
};

/**
 * Aggregates diagnostics into the baseline shape: one count per
 * warning/info `category`, plus one `__errors__` total for every
 * `error`-severity diagnostic regardless of category (see file header
 * for why errors are not split by rule).
 */
export const aggregateBaseline = (
	diagnostics: readonly IBiomeDiagnostic[],
): Record<string, number> => {
	const counts: Record<string, number> = {};
	for (const d of diagnostics) {
		if (d.severity === 'warning' || d.severity === 'info') {
			const key = d.category ?? 'unknown';
			counts[key] = (counts[key] ?? 0) + 1;
		} else {
			counts[ERRORS_KEY] = (counts[ERRORS_KEY] ?? 0) + 1;
		}
	}
	return counts;
};

export interface IBaselineComparison {
	readonly regressions: readonly string[];
	readonly shrankKeys: readonly string[];
}

/**
 * Compares current per-category counts against the baseline ceiling.
 * A key regresses when its current count exceeds the baselined count
 * (0 when the key is new). Counts below baseline are reported as
 * "shrank" but never fail — the baseline is a ceiling, not a floor.
 */
export const compareToBaseline = (
	current: Readonly<Record<string, number>>,
	baseline: Readonly<Record<string, number>>,
): IBaselineComparison => {
	const regressions: string[] = [];
	const shrankKeys: string[] = [];

	for (const [key, count] of Object.entries(current)) {
		const allowed = baseline[key] ?? 0;
		if (count > allowed) {
			regressions.push(
				`  ${key}: ${count} (baseline ${allowed}, +${count - allowed})`,
			);
		} else if (count < allowed) {
			shrankKeys.push(key);
		}
	}

	return { regressions, shrankKeys };
};

const totalOf = (counts: Readonly<Record<string, number>>): number =>
	Object.values(counts).reduce((a, b) => a + b, 0);

/** Runs `biome ci --reporter=json` over `SCAN_DIRS` and returns raw stdout. */
export const runBiomeCi = (root: string): string => {
	const res = spawnSync(
		'bun',
		['x', 'biome', 'ci', ...SCAN_DIRS, '--reporter=json'],
		{
			cwd: root,
			encoding: 'utf8',
			maxBuffer: 64 * 1024 * 1024,
		},
	);
	if (res.error) throw res.error;
	if (!res.stdout) {
		throw new Error(
			`biome-baseline: \`bun x biome ci\` produced no stdout (stderr: ${res.stderr?.slice(0, 2000) ?? ''})`,
		);
	}
	return res.stdout;
};

const loadBaseline = (root: string): Record<string, number> => {
	const abs = join(root, BASELINE_REL);
	if (!existsSync(abs)) return {};
	return JSON.parse(readFileSync(abs, 'utf8')) as Record<string, number>;
};

const writeBaseline = (root: string, counts: Record<string, number>): void => {
	const sorted: Record<string, number> = {};
	for (const key of Object.keys(counts).sort((a, b) => a.localeCompare(b))) {
		sorted[key] = counts[key] ?? 0;
	}
	writeFileSync(
		join(root, BASELINE_REL),
		`${JSON.stringify(sorted, null, '\t')}\n`,
		'utf8',
	);
};

const main = (): number => {
	const root = repoRoot();
	const args = new Set(process.argv.slice(2));

	const raw = runBiomeCi(root);
	const { summary, diagnostics } = parseBiomeJsonOutput(raw);
	const current = aggregateBaseline(diagnostics);
	const fileCount = summary.errors + summary.warnings + summary.infos; // sanity signal only

	if (args.has('--update')) {
		writeBaseline(root, current);
		process.stderr.write(
			`biome-baseline: baseline updated — ${Object.keys(current).length} categories, ${totalOf(current)} diagnostics (${current[ERRORS_KEY] ?? 0} errors).\n`,
		);
		return 0;
	}

	const baseline = loadBaseline(root);

	if (args.has('--report')) {
		process.stderr.write(
			`biome-baseline: ${Object.keys(current).length} categories / ${totalOf(current)} diagnostics ` +
				`(errors ${current[ERRORS_KEY] ?? 0}, baseline total ${totalOf(baseline)}). Diagnostic-weighted count ${fileCount}.\n`,
		);
		return 0;
	}

	const { regressions, shrankKeys } = compareToBaseline(current, baseline);

	if (regressions.length > 0) {
		process.stderr.write(
			`✖ biome-baseline: ${regressions.length} categor${regressions.length === 1 ? 'y' : 'ies'} regressed:\n${regressions.join('\n')}\n\n` +
				`  Run \`bunx biome ci ${SCAN_DIRS.join(' ')}\` locally to see the new diagnostics.\n` +
				`  If this growth is intentional and reviewed, run \`bun tools/scripts/lint/biome-baseline.script.ts --update\` to rebaseline.\n`,
		);
		return 1;
	}

	if (shrankKeys.length > 0) {
		process.stderr.write(
			`✓ biome-baseline: no regressions; baseline shrank for ${shrankKeys.length} categor${shrankKeys.length === 1 ? 'y' : 'ies'} ` +
				`(${totalOf(baseline)} → ${totalOf(current)} total). Run --update to lock in the win.\n`,
		);
		return 0;
	}

	process.stderr.write(
		`✓ biome-baseline: no new Biome violations (${totalOf(current)} diagnostics baselined, ${current[ERRORS_KEY] ?? 0} errors).\n`,
	);
	return 0;
};

if (import.meta.main) process.exit(main());
