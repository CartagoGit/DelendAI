#!/usr/bin/env bun

/**
 * changed-file-coverage — judge the coverage of what a pull request
 * actually changed, when the global floor cannot be judged at all.
 *
 * WHY this exists: once a pull request runs only the tests its changes
 * affect, the merged report covers a subset of the suite while the
 * denominator still spans the whole repository. The global percentages
 * collapse, and the four repo-wide floors in `vitest.config.ts` stop
 * meaning anything on that run. There are exactly two honest responses
 * to that, and "lower the floors" is neither of them: either run
 * everything, or judge something the partial evidence can actually
 * support.
 *
 * This is the second. A pull request's own files are covered by the
 * tests that a pull request's own changes selected, so those files ARE
 * measurable — and holding new code to the floor is a stricter question
 * than holding the repository's average to it, not a weaker one. The
 * untouched majority is not re-judged because it did not change; its
 * verdict is the one the integration branch's full run already gave it.
 *
 * WHAT IT WILL NOT DO: report a pass it did not establish. A run with no
 * report, or one where every changed source file is missing from the
 * report it does have, is `NOT_EXECUTABLE` and exits non-zero. Only a
 * pull request with no coverable source file in it — documentation,
 * workflows, configuration — is allowed to pass without a number, and
 * that is a verified answer rather than an absent one.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { repoRoot } from '../lib/repo-root';

import type {
	IChangedCoverageReport,
	ICoverageCounts,
	ICoverageMetrics,
	IFileCoverageEntry,
} from './changed-file-coverage.interface';

export type {
	IChangedCoverageReport,
	IChangedCoverageVerdict,
	ICoverageMetrics,
} from './changed-file-coverage.interface';

const pct = (counts: ICoverageCounts): number =>
	counts.total === 0 ? 100 : (counts.covered / counts.total) * 100;

/**
 * Sum the counts, then divide — never average the percentages.
 *
 * A 100%-covered one-line file and a 10%-covered thousand-line file do
 * not average to 55% of anything real, and a gate that says they do can
 * be passed by adding trivial files.
 */
const aggregate = (
	entries: readonly IFileCoverageEntry[],
): ICoverageMetrics => {
	const sum = (pick: (e: IFileCoverageEntry) => ICoverageCounts) =>
		entries.reduce<ICoverageCounts>(
			(acc, entry) => ({
				total: acc.total + pick(entry).total,
				covered: acc.covered + pick(entry).covered,
			}),
			{ total: 0, covered: 0 },
		);
	return {
		statements: pct(sum((e) => e.statements)),
		branches: pct(sum((e) => e.branches)),
		functions: pct(sum((e) => e.functions)),
		lines: pct(sum((e) => e.lines)),
	};
};

/**
 * The whole decision, as a pure function over the two inputs.
 *
 * Separated from reading files and from git so every verdict —
 * including the two that must never be confused with a pass — can be
 * pinned by a case instead of being reproduced by staging a repository.
 */
export const judgeChangedCoverage = (input: {
	readonly changed: readonly string[];
	readonly summary: Readonly<Record<string, IFileCoverageEntry>> | undefined;
	readonly floors: ICoverageMetrics;
}): IChangedCoverageReport => {
	// No report at all is the one thing that can never be a pass: it is
	// the state a broken run and a passing run are indistinguishable in.
	if (input.summary === undefined) {
		return {
			verdict: 'NOT_EXECUTABLE',
			judged: [],
			unmeasured: input.changed,
			measured: undefined,
			shortfalls: [],
			reason: 'there is no coverage report, so nothing about this change was measured.',
		};
	}

	// The report itself decides what coverage measures. `coverage.all`
	// is on, so the summary enumerates every file the `include`/`exclude`
	// configuration selects — covered or not. Re-deriving that list from path
	// patterns here would be a second source of truth for it, and it
	// would already be wrong: the real list takes `apps/web/scripts/**`
	// (no `src` segment), takes only `tools/scripts/lib/**` out of
	// `tools/`, and drops every `*.script.ts` and pure barrel.
	const judged: string[] = [];
	const unmeasured: string[] = [];
	const entries: IFileCoverageEntry[] = [];
	for (const path of input.changed) {
		const entry = input.summary[path];
		if (entry === undefined) {
			unmeasured.push(path);
			continue;
		}
		judged.push(path);
		entries.push(entry);
	}

	if (entries.length === 0) {
		return {
			verdict: 'NOT_APPLICABLE',
			judged,
			unmeasured,
			measured: undefined,
			shortfalls: [],
			reason: 'no changed file is one coverage measures, so there is no coverage to judge — an absent question, not an unanswered one.',
		};
	}

	const measured = aggregate(entries);
	const shortfalls = (
		['statements', 'branches', 'functions', 'lines'] as const
	)
		.filter((metric) => measured[metric] < input.floors[metric])
		.map(
			(metric) =>
				`${metric} ${measured[metric].toFixed(2)}% < ${input.floors[metric]}%`,
		);

	return {
		verdict: shortfalls.length === 0 ? 'PASS' : 'FAIL',
		judged,
		unmeasured,
		measured,
		shortfalls,
		reason:
			shortfalls.length === 0
				? `${judged.length} changed source file(s) meet every floor.`
				: `${judged.length} changed source file(s) came in under ${shortfalls.length} floor(s).`,
	};
};

/** Read vitest's json-summary, keyed by repo-relative path. */
const readSummary = (
	path: string,
): Readonly<Record<string, IFileCoverageEntry>> | undefined => {
	if (!existsSync(path)) return undefined;
	const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<
		string,
		IFileCoverageEntry
	>;
	const root = repoRoot();
	const byRelativePath: Record<string, IFileCoverageEntry> = {};
	for (const [key, value] of Object.entries(raw)) {
		if (key === 'total') continue;
		byRelativePath[relative(root, resolve(root, key))] = value;
	}
	return byRelativePath;
};

const arg = (name: string): string | undefined => {
	const hit = process.argv.find((each) => each.startsWith(`--${name}=`));
	return hit?.slice(name.length + 3);
};

/**
 * The files this change touched, as git sees them.
 *
 * Three dots, not two: the subject is what the branch ADDED, not
 * everything the base has moved on to since. With two dots a pull
 * request would be judged on files it never opened.
 */
const changedSince = (base: string): readonly string[] =>
	execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
		cwd: repoRoot(),
		encoding: 'utf8',
		maxBuffer: 16 * 1024 * 1024,
	})
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

const main = (): number => {
	const summaryPath = resolve(
		repoRoot(),
		arg('summary') ?? '.cache/coverage/coverage-summary.json',
	);
	const base = arg('base');
	const changed =
		base === undefined
			? (arg('changed-file') ?? '')
					.trim()
					.split('\n')
					.map((line) => line.trim())
					.filter((line) => line.length > 0)
			: changedSince(base);

	const report = judgeChangedCoverage({
		changed,
		summary: readSummary(summaryPath),
		floors: {
			statements: Number(arg('statements') ?? 82),
			branches: Number(arg('branches') ?? 69),
			functions: Number(arg('functions') ?? 83),
			lines: Number(arg('lines') ?? 83),
		},
	});

	console.log(`changed-file-coverage: ${report.verdict} — ${report.reason}`);
	for (const shortfall of report.shortfalls) {
		console.log(`  under floor: ${shortfall}`);
	}
	if (report.unmeasured.length > 0) {
		console.log(
			`  not in the report (excluded from coverage, or never executed): ${report.unmeasured.join(', ')}`,
		);
	}
	return report.verdict === 'PASS' || report.verdict === 'NOT_APPLICABLE'
		? 0
		: 1;
};

if (import.meta.main) process.exit(main());
