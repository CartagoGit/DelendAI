/**
 * summarise-ci-log.spec.ts — f00536 S3: the failing assertion and its job
 * name survive the summarisation. Fixtures are the shapes this
 * repository's CI printed on 2026-09-24, colour codes and timestamps
 * included.
 */
import { describe, expect, it } from 'vitest';

import { summariseCiLog } from '../../../../src/lib/context-budget/summarise-ci-log.helper';

const ts = (text: string) => `2026-09-24T21:25:32.4548911Z ${text}`;

const vitestJobLog = [
	ts('Complete job name: tests: tools 3/3'),
	ts('##[group]Run actions/checkout@v7'),
	ts('Received 324567763 of 324567763 (100.0%), 154.4 MBs/sec'),
	ts('##[group]Run bun run test:shard -- tools --shard=3/3'),
	...Array.from({ length: 500 }, (_, i) =>
		ts(
			`\u001b[32m✓\u001b[39m tools scripts/x-${String(i)}.spec.ts > passes`,
		),
	),
	ts(
		'\u001b[41m\u001b[1m FAIL \u001b[22m\u001b[49m \u001b[30m\u001b[43m commit-policy \u001b[49m\u001b[39m tests/src/lib/tools/work-ref.tool.spec.ts > commit_policy_work_ref > rejects traversal before invoking the WIP engine',
	),
	ts(
		"\u001b[31m\u001b[1mError\u001b[22m: ENOTEMPTY: directory not empty, rmdir '/tmp/commit-policy-work-ref-remote-VQIktx/info'\u001b[39m",
	),
	ts(
		'\u001b[2m      Tests \u001b[22m \u001b[1m\u001b[31m1 failed\u001b[39m\u001b[22m\u001b[2m | \u001b[22m\u001b[1m\u001b[32m1173 passed\u001b[39m\u001b[22m\u001b[2m | \u001b[22m\u001b[33m1 skipped\u001b[39m',
	),
	ts('error: script "test:shard" exited with code 1'),
	ts('##[error]Process completed with exit code 1.'),
	ts('##[group]Run actions/upload-artifact@v7'),
].join('\n');

describe('summariseCiLog', () => {
	it('keeps the job, the failing step, the tally and the failing assertion of a vitest job', () => {
		const summary = summariseCiLog(vitestJobLog);
		expect(summary.runner).toBe('vitest');
		expect(summary.job).toBe('tests: tools 3/3');
		expect(summary.failedStep).toBe(
			'bun run test:shard -- tools --shard=3/3',
		);
		expect(summary.tally).toEqual({ passed: 1173, failed: 1, skipped: 1 });
		expect(summary.failures).toEqual([
			{
				test: 'tests/src/lib/tools/work-ref.tool.spec.ts > commit_policy_work_ref > rejects traversal before invoking the WIP engine',
				reason: "Error: ENOTEMPTY: directory not empty, rmdir '/tmp/commit-policy-work-ref-remote-VQIktx/info'",
			},
		]);
		expect(summary.errors).toEqual(['Process completed with exit code 1.']);
		// 500+ lines of transcript become a handful of fields.
		expect(summary.linesRead).toBeGreaterThan(500);
		expect(JSON.stringify(summary).length).toBeLessThan(1_000);
	});

	it('attaches the reason printed under a failure listed twice', () => {
		const log = [
			' FAIL  core tests/a.spec.ts > suite > breaks',
			' FAIL  core tests/b.spec.ts > suite > also breaks',
			'⎯⎯⎯ Failed Tests 2 ⎯⎯⎯',
			' FAIL  core tests/a.spec.ts > suite > breaks',
			'AssertionError: expected 1 to be 2',
			' FAIL  core tests/b.spec.ts > suite > also breaks',
			'AssertionError: expected [] to deeply equal [ 1 ]',
			'      Tests  2 failed | 10 passed (12)',
		].join('\n');
		expect(summariseCiLog(log).failures).toEqual([
			{
				test: 'tests/a.spec.ts > suite > breaks',
				reason: 'AssertionError: expected 1 to be 2',
			},
			{
				test: 'tests/b.spec.ts > suite > also breaks',
				reason: 'AssertionError: expected [] to deeply equal [ 1 ]',
			},
		]);
	});

	it('reads a bun test run: its failures, reasons and counts', () => {
		const log = [
			'(pass) proposals-sqlite driver > applies [57.71ms]',
			'(fail) proposals-sqlite driver (q00022 S1) > MIGRATION_FILES lists the migrations in order [0.76ms]',
			'error: expect(received).toEqual(expected)',
			' 356 pass',
			' 9 fail',
			'Ran 365 tests across 69 files. [92.04s]',
		].join('\n');
		const summary = summariseCiLog(log);
		expect(summary.runner).toBe('bun');
		expect(summary.tally).toEqual({ passed: 356, failed: 9, skipped: 0 });
		expect(summary.failures).toEqual([
			{
				test: 'proposals-sqlite driver (q00022 S1) > MIGRATION_FILES lists the migrations in order',
				reason: 'error: expect(received).toEqual(expected)',
			},
		]);
	});

	it('says it does not recognise a log instead of guessing', () => {
		const summary = summariseCiLog('building…\ndone.');
		expect(summary.runner).toBe('unknown');
		expect(summary.failures).toEqual([]);
		expect(summary.tally).toBeUndefined();
	});
});
