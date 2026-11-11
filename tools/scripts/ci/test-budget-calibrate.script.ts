#!/usr/bin/env bun
/**
 * test-budget-calibrate.script.ts — set test budgets from what CI measured.
 *
 *   bun run test:budgets:calibrate --from-ci=<run-id> [--update]
 *   bun run test:budgets:calibrate --from=<dir> [--update]
 *
 * Reads the `test-durations-*` artifacts a CI run's shards uploaded (or a
 * directory of them), takes the longest time each test measured, and lists
 * the tests whose declared budget is below it, with ceil(1.5 x max) (at
 * least 4 ms more) as their budget. `--update` rewrites those numbers in the
 * specs; nothing else is touched, and no budget is ever lowered.
 *
 *   bun tools/scripts/ci/test-budget-calibrate.script.ts --digest=<blob-dir> --out=<file>
 * is what a CI shard runs to turn its blob report into that small artifact.
 *
 *   bun run test:budgets:check   (--check=<blob-dir>)
 * is what the merge step runs: it fails, naming the calibrated number, for
 * every test CI measured over its declared budget. A budget the change itself
 * writes does not fail its shard (CI never measured it), so this is where
 * such a number is corrected.
 *
 *   bun run test:budgets:calibrate --from-develop=<n> [--update]
 * reads the last n integration-branch runs instead of one: the scheduled
 * calibration, so long-standing budgets follow what CI measures.
 */
import { execFileSync } from 'node:child_process';
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { repoRoot } from '../lib/repo-root';
import { INTEGRATION_REF } from './declared-test-budget';
import {
	budgetChanges,
	longestDurations,
	measuredTestsOfBlob,
	requiredCorrection,
	type ITestDurations,
	withCalibratedBudget,
} from './test-budget-calibration';

/** The integration branch whose runs the scheduled calibration reads. */
const INTEGRATION_BRANCH = INTEGRATION_REF.replace(/^origin\//u, '');

const arg = (name: string): string | undefined =>
	process.argv
		.find((value) => value.startsWith(`--${name}=`))
		?.slice(name.length + 3);

const jsonFiles = (dir: string): string[] =>
	readdirSync(dir, { recursive: true, encoding: 'utf8' })
		.filter((name) => name.endsWith('.json'))
		.map((name) => join(dir, name));

const durationsOfBlobs = (blobs: string): ITestDurations => {
	let durations: ITestDurations = {};
	for (const file of jsonFiles(blobs)) {
		durations = longestDurations(
			measuredTestsOfBlob(readFileSync(file, 'utf8'), repoRoot()),
			durations,
		);
	}
	return durations;
};

const digest = (blobs: string, out: string): number => {
	const durations = durationsOfBlobs(blobs);
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(out, `${JSON.stringify(durations)}\n`);
	console.log(
		`test-budget-calibrate: ${String(Object.keys(durations).length)} spec file(s) digested to ${out}.`,
	);
	return 0;
};

const download = (run: string, dir: string): void => {
	try {
		execFileSync(
			'gh',
			[
				'run',
				'download',
				run,
				'--pattern',
				'test-durations-*',
				'--dir',
				dir,
			],
			{ stdio: 'inherit' },
		);
	} catch {
		// A run whose artifacts expired or never uploaded adds nothing.
		console.error(
			`test-budget-calibrate: no per-test times in run ${run}.`,
		);
	}
};

/** The last `count` completed CI runs of the integration branch. */
const developRuns = (count: number): readonly string[] =>
	count > 0
		? execFileSync(
				'gh',
				[
					'run',
					'list',
					'--workflow=ci.yml',
					`--branch=${INTEGRATION_BRANCH}`,
					'--status=completed',
					`--limit=${String(count)}`,
					'--json=databaseId',
					'--jq=.[].databaseId',
				],
				{ encoding: 'utf8' },
			)
				.split('\n')
				.filter(Boolean)
		: [];

/** Fail, naming the number CI calls for, while a test runs over its declared budget. */
const requireCalibrated = (blobs: string): number => {
	const changes = budgetChanges(durationsOfBlobs(blobs));
	for (const c of changes) console.error(requiredCorrection(c));
	console.log(
		`test-budget-calibrate: ${String(changes.length)} test(s) over their declared budget.`,
	);
	return changes.length === 0 ? 0 : 1;
};

const main = (): number => {
	const blobs = arg('digest');
	if (blobs !== undefined)
		return digest(blobs, arg('out') ?? 'test-durations.json');
	const check = arg('check');
	if (check !== undefined) return requireCalibrated(check);
	let dir = arg('from');
	const runs = [
		...(arg('from-ci') === undefined ? [] : [String(arg('from-ci'))]),
		...developRuns(Number(arg('from-develop') ?? 0)),
	];
	if (dir === undefined && runs.length > 0) {
		dir = mkdtempSync(join(tmpdir(), 'test-durations-'));
		for (const run of runs) download(run, join(dir, run));
	}
	if (dir === undefined) {
		console.error(
			'test-budget-calibrate: --from-ci=<run-id>, --from-develop=<n>, --from=<dir> or --check=<blob-dir> is required.',
		);
		return 2;
	}
	let durations: ITestDurations = {};
	for (const file of jsonFiles(dir)) {
		const part = JSON.parse(readFileSync(file, 'utf8')) as ITestDurations;
		durations = longestDurations(
			Object.entries(part).flatMap(([f, tests]) =>
				Object.entries(tests).map(([name, tookMs]) => ({
					file: f,
					name,
					tookMs,
				})),
			),
			durations,
		);
	}
	const changes = budgetChanges(durations);
	for (const c of changes) {
		console.log(
			`${c.file} > ${c.name}: CI measured ${String(c.maxMs)} ms, declared ${String(c.declared)} ms, calibrated ${String(c.calibrated)} ms`,
		);
	}
	console.log(
		`test-budget-calibrate: ${String(changes.length)} test(s) declare less than CI measured.`,
	);
	if (process.argv.includes('--update')) {
		for (const c of changes) {
			const path = join(repoRoot(), c.file);
			const next = withCalibratedBudget(readFileSync(path, 'utf8'), c);
			if (next === undefined)
				console.error(
					`not rewritten (name not found once): ${c.file} > ${c.name}`,
				);
			else writeFileSync(path, next);
		}
	}
	return 0;
};

if (import.meta.main) process.exit(main());
