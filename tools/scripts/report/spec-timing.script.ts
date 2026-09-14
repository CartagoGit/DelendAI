#!/usr/bin/env bun
/**
 * spec-timing.script.ts — x00542 S1.
 *
 * Measure, per vitest project, the cost of its most expensive test, and
 * report that cost against the ceiling the project declares.
 *
 * ## Why a measurement and not a convention
 *
 * A full `validate` run starts ~1,466 spec files in parallel. The same
 * spec that transforms in 11 s on an idle machine pays several times
 * that under contention — in one measured run, `transform` accumulated
 * 2,333 s and `import` 4,243 s over 900 s of wall clock. With that
 * inflation, any margin below roughly 6x is a coin flip, and a run that
 * fails on a coin flip blocks `close_slice`, which accepts `validate` as
 * evidence.
 *
 * x00542 opens with five consecutive `validate` runs that stopped at
 * five different points, none of the specs involved broken.
 *
 * ## What it does NOT do
 *
 * It does not raise every ceiling to the maximum. A generous ceiling
 * over a spec that should take 50 ms hides exactly what one wants to
 * see. The report states the margin; the decision stays with a person,
 * and lands in the project's own config with the measurement cited.
 *
 * Usage:
 *   bun tools/scripts/report/spec-timing.script.ts            # every project
 *   bun tools/scripts/report/spec-timing.script.ts --implicit # only those on
 *                                                             # vitest's 5 s default
 *   bun tools/scripts/report/spec-timing.script.ts --json
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

import {
	declaredTimeoutOf,
	VITEST_DEFAULT_TIMEOUT_MS,
} from '../lint/spec-timeout-undercut.script';

const REPO_ROOT = process.cwd();

const SKIP_DIRS = new Set([
	'node_modules',
	'dist',
	'build',
	'coverage',
	'.git',
	'.cache',
]);

/**
 * The margin below which a ceiling stops being a decision and becomes a
 * coin flip, from the measurement in x00542.
 */
export const MINIMUM_MARGIN = 6;

/** The ladder a ceiling is rounded UP to, so the set stays readable. */
export const CEILING_SCALE = [30_000, 60_000, 120_000] as const;

export interface ISuiteTiming {
	readonly project: string;
	readonly declaredMs: number;
	readonly implicit: boolean;
	readonly slowestMs: number;
	readonly slowestTest: string;
	readonly testCount: number;
	/** `declaredMs / slowestMs`, or `null` when nothing ran. */
	readonly margin: number | null;
	readonly suggestedMs: number | null;
}

const walk = (dir: string, out: string[] = []): readonly string[] => {
	let entries: readonly import('node:fs').Dirent[];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (SKIP_DIRS.has(entry.name)) continue;
			walk(join(dir, entry.name), out);
			continue;
		}
		if (entry.name === 'vitest.config.ts') out.push(join(dir, entry.name));
	}
	return out;
};

/** Every vitest project in the workspace, nearest-first by path. */
export const vitestProjects = (root: string): readonly string[] =>
	[...walk(root)]
		.map((config) => dirname(config))
		.sort((left, right) => left.localeCompare(right));

interface IVitestJsonReport {
	readonly testResults?: readonly {
		readonly assertionResults?: readonly {
			readonly fullName?: string;
			readonly duration?: number;
			readonly status?: string;
		}[];
	}[];
}

/** The slowest assertion in a vitest JSON report, and how many ran. */
export const slowestOf = (
	report: IVitestJsonReport,
): { readonly ms: number; readonly name: string; readonly count: number } => {
	let ms = 0;
	let name = '';
	let count = 0;
	for (const file of report.testResults ?? []) {
		for (const assertion of file.assertionResults ?? []) {
			if (assertion.status === 'pending') continue;
			count += 1;
			const duration = assertion.duration ?? 0;
			if (duration > ms) {
				ms = duration;
				name = assertion.fullName ?? '';
			}
		}
	}
	return { ms, name, count };
};

/** The smallest ceiling on the scale that clears `MINIMUM_MARGIN`. */
export const suggestCeiling = (slowestMs: number): number => {
	const needed = slowestMs * MINIMUM_MARGIN;
	for (const step of CEILING_SCALE) {
		if (step >= needed) return step;
	}
	return CEILING_SCALE[CEILING_SCALE.length - 1] ?? 120_000;
};

const measure = (projectDir: string): ISuiteTiming => {
	const declaredMs = declaredTimeoutOf(
		readFileSync(join(projectDir, 'vitest.config.ts'), 'utf8'),
	);
	const outDir = mkdtempSync(join(tmpdir(), 'spec-timing-'));
	const outFile = join(outDir, 'report.json');
	try {
		spawnSync(
			'bun',
			[
				'x',
				'vitest',
				'run',
				'--root',
				projectDir,
				'--reporter=json',
				`--outputFile=${outFile}`,
			],
			{ cwd: REPO_ROOT, stdio: 'ignore' },
		);
		let report: IVitestJsonReport = {};
		try {
			report = JSON.parse(
				readFileSync(outFile, 'utf8'),
			) as IVitestJsonReport;
		} catch {
			// A suite that could not produce a report is reported as
			// unmeasured rather than as fast: those are the two states
			// this script exists to keep apart.
		}
		const slowest = slowestOf(report);
		return {
			project: relative(REPO_ROOT, projectDir) || '.',
			declaredMs,
			implicit: declaredMs === VITEST_DEFAULT_TIMEOUT_MS,
			slowestMs: Math.round(slowest.ms),
			slowestTest: slowest.name,
			testCount: slowest.count,
			margin:
				slowest.ms > 0
					? Number((declaredMs / slowest.ms).toFixed(1))
					: null,
			suggestedMs: slowest.ms > 0 ? suggestCeiling(slowest.ms) : null,
		};
	} finally {
		rmSync(outDir, { recursive: true, force: true });
	}
};

export const formatReport = (rows: readonly ISuiteTiming[]): string => {
	const lines = [
		'spec-timing: slowest test per suite, against the ceiling the suite declares.',
		'',
		'suite                                   declared  slowest   margin  suggested',
	];
	for (const row of rows) {
		lines.push(
			[
				row.project.padEnd(38),
				`${String(row.declaredMs)}${row.implicit ? '*' : ' '}`.padStart(
					9,
				),
				`${String(row.slowestMs)}ms`.padStart(9),
				(row.margin === null ? '—' : `${String(row.margin)}x`).padStart(
					8,
				),
				(row.suggestedMs === null
					? '—'
					: String(row.suggestedMs)
				).padStart(10),
			].join(''),
		);
	}
	lines.push(
		'',
		'* the implicit vitest default: an omission, not a decision.',
	);
	const thin = rows.filter(
		(row) => row.margin !== null && row.margin < MINIMUM_MARGIN,
	);
	if (thin.length > 0) {
		lines.push(
			'',
			`${String(thin.length)} suite(s) under the ${String(MINIMUM_MARGIN)}x margin a loaded machine needs:`,
		);
		for (const row of thin) {
			lines.push(
				`  ${row.project} — ${row.slowestTest} at ${String(row.slowestMs)}ms`,
			);
		}
	}
	return lines.join('\n');
};

export const main = (
	argv: readonly string[] = process.argv.slice(2),
): number => {
	const onlyImplicit = argv.includes('--implicit');
	const asJson = argv.includes('--json');
	const rows: ISuiteTiming[] = [];
	for (const projectDir of vitestProjects(REPO_ROOT)) {
		const declaredMs = declaredTimeoutOf(
			readFileSync(join(projectDir, 'vitest.config.ts'), 'utf8'),
		);
		if (onlyImplicit && declaredMs !== VITEST_DEFAULT_TIMEOUT_MS) continue;
		rows.push(measure(projectDir));
	}
	console.log(asJson ? JSON.stringify(rows, null, 2) : formatReport(rows));
	return 0;
};

if (import.meta.main) process.exit(main());
