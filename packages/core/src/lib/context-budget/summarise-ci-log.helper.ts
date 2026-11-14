/**
 * summarise-ci-log.helper.ts — a CI log comes back as structure, not transcript.
 *
 * A job log runs to thousands of lines, and the decision it feeds needs
 * a handful: which job, which step failed, the tally, and for each
 * failing test the one line that says why. Everything else — runner
 * provisioning, dependency downloads, every passing test — is how the
 * log got there. Reading it whole costs the reader's context and buries
 * the assertion under the setup.
 *
 * Pure over the text. It understands the shapes this repository's CI
 * produces — GitHub Actions' timestamped lines and `##[group]` /
 * `##[error]` markers, vitest's and bun's test output, ANSI colour — and
 * reports `runner: 'unknown'` rather than guessing when it sees neither.
 */
import type { ICiLogSummary } from '../contracts/interfaces/ci-log-summary.interface';

/** Colour codes: ESC, `[`, parameters, `m`. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'gu');
const ACTIONS_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z ?/u;

/** A log line without colour codes or the Actions timestamp. */
const clean = (line: string): string =>
	line.replace(ANSI, '').replace(ACTIONS_TIMESTAMP, '').trimEnd();

const VITEST_FAIL =
	/^\s*FAIL\s+(?:\S+\s+)?(.+?\.(?:spec|test)\.[cm]?[jt]sx?\s+>\s+.+)$/u;
const VITEST_TALLY = /^\s*Tests\s+(.*)$/u;
const BUN_FAIL = /^\(fail\)\s+(.+?)(?:\s+\[[\d.]+m?s\])?$/u;
const BUN_COUNT = /^\s*(\d+)\s+(pass|fail|skip)$/u;
const REASON =
	/^\s*(?:AssertionError|Error|TypeError|expect\(|Expected|error:)[:\s]/u;

const countIn = (text: string, word: string): number => {
	const match = new RegExp(`(\\d+)\\s+${word}`, 'u').exec(text);
	return match?.[1] === undefined ? 0 : Number.parseInt(match[1], 10);
};

export const summariseCiLog = (log: string): ICiLogSummary => {
	const lines = log.split('\n').map(clean);
	let runner: ICiLogSummary['runner'] = 'unknown';
	let job: string | undefined;
	let step: string | undefined;
	let failedStep: string | undefined;
	let tally: ICiLogSummary['tally'];
	const bunCounts = { pass: 0, fail: 0, skip: 0 };
	let sawBunCount = false;
	const failures: { test: string; reason?: string }[] = [];
	const byTest = new Map<string, { test: string; reason?: string }>();
	const errors: string[] = [];
	let awaitingReason: { test: string; reason?: string } | undefined;

	// A runner names a failing test once in its progress and again above
	// its assertion; both are the same failure, and the reason may come
	// with either.
	const addFailure = (test: string): void => {
		const known = byTest.get(test);
		if (known !== undefined) {
			awaitingReason = known.reason === undefined ? known : undefined;
			return;
		}
		const failure: { test: string; reason?: string } = { test };
		byTest.set(test, failure);
		failures.push(failure);
		awaitingReason = failure;
	};

	for (const line of lines) {
		const jobName = /^Complete job name:\s*(.+)$/u.exec(line);
		if (jobName?.[1] !== undefined) job = jobName[1];
		const group = /^##\[group\](?:Run\s+)?(.+)$/u.exec(line);
		if (group?.[1] !== undefined) step = group[1];
		const error = /^##\[error\](.+)$/u.exec(line);
		if (error?.[1] !== undefined) {
			errors.push(error[1]);
			failedStep ??= step;
			continue;
		}
		const vitestFail = VITEST_FAIL.exec(line);
		if (vitestFail?.[1] !== undefined) {
			runner = 'vitest';
			addFailure(vitestFail[1].trim());
			continue;
		}
		const vitestTally = VITEST_TALLY.exec(line);
		if (
			vitestTally?.[1] !== undefined &&
			/\d+\s+(passed|failed)/u.test(vitestTally[1])
		) {
			runner = 'vitest';
			tally = {
				passed: countIn(vitestTally[1], 'passed'),
				failed: countIn(vitestTally[1], 'failed'),
				skipped: countIn(vitestTally[1], 'skipped'),
			};
			continue;
		}
		const bunFail = BUN_FAIL.exec(line);
		if (bunFail?.[1] !== undefined) {
			runner = 'bun';
			addFailure(bunFail[1].trim());
			continue;
		}
		const bunCount = BUN_COUNT.exec(line);
		if (bunCount?.[1] !== undefined && bunCount[2] !== undefined) {
			sawBunCount = true;
			bunCounts[bunCount[2] as 'pass' | 'fail' | 'skip'] =
				Number.parseInt(bunCount[1], 10);
			continue;
		}
		if (awaitingReason !== undefined && REASON.test(line)) {
			awaitingReason.reason = line.trim();
			awaitingReason = undefined;
		}
	}
	if (sawBunCount && tally === undefined) {
		if (runner === 'unknown') runner = 'bun';
		tally = {
			passed: bunCounts.pass,
			failed: bunCounts.fail,
			skipped: bunCounts.skip,
		};
	}
	return {
		runner,
		...(job !== undefined ? { job } : {}),
		...(failedStep !== undefined ? { failedStep } : {}),
		...(tally !== undefined ? { tally } : {}),
		failures,
		errors,
		linesRead: lines.length,
	};
};
