#!/usr/bin/env bun
/**
 * spec-duration-budget.script.ts — reads the spec durations a full CI run
 * recorded and fails any spec file over 5 s that is not in the e2e tier
 * by a margin (q00045 S1). Files over 1 s are reported.
 *
 *   bun tools/scripts/ci/spec-duration-budget.script.ts --declared [--update|--init]
 *       every test names its maximum time, "[<7ms] does X" (the other half of the rule the
 *       test-kit runner enforces in the run): a spec file off the migration
 *       list must budget every test, and the list only shrinks
 *   bun tools/scripts/ci/spec-duration-budget.script.ts --timings=<spec-timings.json>
 *   ... --update    drop baseline entries that no longer need it (shrinks only)
 *
 *   ... --mode=pull-request   (default) exit 1 on a clearly slow spec
 *   ... --mode=integration    never fail: print the new offenders, write them
 *                             to --report-out=<file> for the issue step
 *   ... --changed-files=<file>   with pull-request: fail only a spec the change
 *                             adds or edits (one path per line): the run
 *                             also times neighbours it did not touch, and a
 *                             pull request does not answer for those
 *   ... --history=a.json,b.json  earlier runs' timings; the median is judged
 *
 * The baseline (spec-duration-budget.baseline.json) lists the offenders the
 * gate started with. It only shrinks: `--update` never adds a path.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { UNIT_LIMIT_MS } from '../../../packages/test-kit/src/contracts/constants/time-budget.constant';
import { isE2eSpec } from '../../../packages/test-kit/src/lib/time-budget/time-budget-tier.helper';
import {
	budgetsOverUnitLimit,
	changedFiles,
	judgeDeclaredBudgets,
	judgeUnitLimit,
	unbudgetedTests,
} from './declared-test-budget';
import {
	CLEAR_MS,
	FAIL_MS,
	failuresOfChange,
	judgeSpecDurations,
	REPORT_MS,
} from './spec-duration-budget';

const BASELINE = join(
	dirname(fileURLToPath(import.meta.url)),
	'spec-duration-budget.baseline.json',
);

const arg = (name: string): string | undefined =>
	process.argv
		.find((value) => value.startsWith(`--${name}=`))
		?.slice(name.length + 3);

const readBaseline = (): readonly string[] =>
	JSON.parse(readFileSync(BASELINE, 'utf8')) as string[];

const MIGRATION = join(
	dirname(fileURLToPath(import.meta.url)),
	'../test/test-time-budget.migration.json',
);

const declaredMain = (): number => {
	const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
	const files = new Map<string, number>();
	for (const path of execFileSync('git', ['ls-files', '-z'], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	})
		.split('\0')
		.filter((file) => /\.(?:spec|test)\.ts$/u.test(file))) {
		// A tracked path gone from the working tree has no tests.
		if (!existsSync(join(root, path))) continue;
		files.set(
			path,
			unbudgetedTests(readFileSync(join(root, path), 'utf8')),
		);
	}
	const write = (unbudgeted: readonly string[]): void =>
		writeFileSync(
			MIGRATION,
			`${JSON.stringify({ unbudgeted }, null, '\t')}\n`,
		);
	if (process.argv.includes('--init')) {
		if (existsSync(MIGRATION)) {
			console.error(
				'test-time-budget: the list exists; it only shrinks.',
			);
			return 1;
		}
		write(
			[...files]
				.filter(([, n]) => n > 0)
				.map(([p]) => p)
				.sort(),
		);
		return 0;
	}
	const listed = new Set(
		(
			JSON.parse(readFileSync(MIGRATION, 'utf8')) as {
				unbudgeted: string[];
			}
		).unbudgeted,
	);
	// The changed files come from the input the other gates use: a list
	// file, or the base the change is measured against.
	const { DELENDAI_COVERAGE_BASE: envBase } = process.env;
	const gitOut = (args: readonly string[]): string =>
		execFileSync('git', [...args], {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		});
	const changedList = arg('changed-files');
	const given = arg('base') ?? (envBase === '' ? undefined : envBase);
	// A list file or a given base names the change; otherwise the change is
	// what differs from the integration branch, and unknown when that is.
	const changed =
		changedList !== undefined
			? new Set(readFileSync(changedList, 'utf8').split('\n'))
			: given === undefined
				? changedFiles(gitOut)
				: new Set(
						gitOut([
							'diff',
							'--name-only',
							`${given}...HEAD`,
						]).split('\n'),
					);
	const verdict = judgeDeclaredBudgets(files, listed, changed);
	const over = new Map<string, readonly number[]>();
	for (const path of files.keys()) {
		if (!isE2eSpec(path) && changed?.has(path) !== false) {
			over.set(
				path,
				budgetsOverUnitLimit(readFileSync(join(root, path), 'utf8')),
			);
		}
	}
	const breaches = judgeUnitLimit(over, listed, changed);
	for (const { path, budgets } of breaches) {
		console.error(
			`✖ ${path}: a unit-tier test is held to ${String(UNIT_LIMIT_MS)} ms and declares ${budgets.map(String).join(', ')} ms. Rename the spec to *.e2e.spec.ts, or make the test pure.`,
		);
	}
	if (process.argv.includes('--update')) {
		const stale = new Set(verdict.stale);
		write([...listed].filter((path) => !stale.has(path)).sort());
		console.log(`test-time-budget: ${String(stale.size)} entries dropped.`);
		return verdict.missing.length === 0 ? 0 : 1;
	}
	for (const { path, tests } of verdict.missing) {
		console.error(
			`✖ ${path}: ${String(tests)} test(s) declare no time budget. Start each name with its budget, "[<7ms] does X" — the run fails a test with none, or over it.`,
		);
	}
	for (const path of verdict.touched) {
		console.error(
			`✖ ${path}: this change edits it, so every test in it names its budget ("[<7ms] does X") and the file leaves the migration list.`,
		);
	}
	for (const path of verdict.stale) {
		console.error(
			`✖ ${path}: no longer needs its migration entry (run --declared --update); the list only shrinks.`,
		);
	}
	if (
		verdict.missing.length +
			verdict.stale.length +
			verdict.touched.length +
			breaches.length ===
		0
	) {
		console.log(
			`✓ test-time-budget: every test off the ${String(listed.size)}-file migration list declares a maximum time.`,
		);
	}
	return verdict.missing.length +
		verdict.stale.length +
		verdict.touched.length +
		breaches.length ===
		0
		? 0
		: 1;
};

const main = (): number => {
	if (process.argv.includes('--declared')) return declaredMain();
	const from = arg('timings');
	if (from === undefined) {
		console.error('spec-duration-budget: --timings=<file> is required.');
		return 2;
	}
	const timings = JSON.parse(readFileSync(from, 'utf8')) as Record<
		string,
		number
	>;
	const baseline = readBaseline();
	const history = (arg('history') ?? '')
		.split(',')
		.filter((file) => file !== '' && existsSync(file))
		.map(
			(file) =>
				JSON.parse(readFileSync(file, 'utf8')) as Record<
					string,
					number
				>,
		);
	const integration = arg('mode') === 'integration';
	const verdict = judgeSpecDurations(timings, new Set(baseline), history);
	console.log(
		`spec-duration-budget: ${String(verdict.slow.length)} spec file(s) over ${String(REPORT_MS)} ms.`,
	);
	for (const { path, ms } of verdict.slow.slice(0, 20)) {
		console.log(`  ${String(ms)} ms  ${path}`);
	}
	if (process.argv.includes('--update')) {
		const stale = new Set(verdict.stale);
		writeFileSync(
			BASELINE,
			`${JSON.stringify(
				baseline.filter((path) => !stale.has(path)),
				null,
				'\t',
			)}\n`,
		);
		console.log(
			`spec-duration-budget: ${String(stale.size)} baseline entr${stale.size === 1 ? 'y' : 'ies'} dropped.`,
		);
		return 0;
	}
	for (const path of verdict.stale) {
		console.warn(
			`  baseline entry no longer needed (run --update): ${path}`,
		);
	}
	if (integration) {
		// Runner noise on code already merged must not turn develop red:
		// report, and let the workflow open or refresh the issue.
		const lines = verdict.offenders.map(
			({ path, ms }) => `- \`${path}\`: ${String(ms)} ms`,
		);
		for (const line of lines) console.warn(`::warning::${line}`);
		const out = arg('report-out');
		if (out !== undefined) {
			writeFileSync(
				out,
				lines.length === 0
					? ''
					: `Spec files over ${String(FAIL_MS)} ms outside the e2e tier and the baseline:\n\n${lines.join('\n')}\n\nMake them fast (in-memory fakes, fake timers, one shared repo) or name them *.e2e.spec.ts.\n`,
			);
		}
		return 0;
	}
	const changedFile = arg('changed-files');
	const touched =
		changedFile === undefined
			? undefined
			: new Set(readFileSync(changedFile, 'utf8').split('\n'));
	const failures = failuresOfChange(verdict.failures, touched);
	for (const { path, ms } of failures) {
		console.error(
			`✖ ${path}: ${String(ms)} ms is over ${String(CLEAR_MS)} ms. Make it fast (in-memory fakes, fake timers, one shared repo) or name it *.e2e.spec.ts.`,
		);
	}
	return failures.length === 0 ? 0 : 1;
};

if (import.meta.main) process.exit(main());
