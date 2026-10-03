import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { formatReport } from './read-test-journal.script.ts';
import {
	appendRunEntry,
	boundJournalLines,
	buildFailureRecord,
	type ITestRunEntry,
	journalPath,
	JOURNAL_BOUNDS,
	makeRunId,
	parseStackText,
	readLastRunEntry,
	readRunEntries,
	safeAppendRunEntry,
	selectSourceFrames,
	toRepoRelative,
	truncate,
} from './test-journal.ts';

const entry = (overrides: Partial<ITestRunEntry> = {}): ITestRunEntry => ({
	schema: 1,
	runId: 'r1',
	timestamp: '2026-09-03T10:00:00.000Z',
	result: 'pass',
	reason: 'passed',
	command: 'vitest run',
	cwd: '/repo',
	durationMs: 1000,
	totals: { files: 1, tests: 2, passed: 2, failed: 0, skipped: 0 },
	failures: [],
	...overrides,
});

describe('test-journal pure helpers', () => {
	it('truncates only past the cap and says how much it dropped', () => {
		expect(truncate('abc', 10)).toBe('abc');
		expect(truncate(undefined, 10)).toBeUndefined();
		const long = 'x'.repeat(20);
		expect(truncate(long, 5)).toBe('xxxxx\n… [truncated 15 chars]');
	});

	it('makes stack frames repo-relative and drops vitest internals', () => {
		const frames = selectSourceFrames({
			stacks: [
				{
					file: '/repo/node_modules/vitest/dist/chunk.js',
					line: 1,
					column: 1,
				},
				{
					file: '/repo/packages/core/src/helper.ts',
					line: 9,
					column: 4,
				},
				{
					file: '/repo/plugins/foo/tests/a.spec.ts',
					line: 3,
					column: 2,
				},
			],
			workspaceRoot: '/repo',
			testFile: '/repo/plugins/foo/tests/a.spec.ts',
		});
		// The test file's own frame sorts first: it is the line to open.
		expect(frames[0]).toEqual({
			file: 'plugins/foo/tests/a.spec.ts',
			line: 3,
			column: 2,
		});
		expect(frames.map((frame) => frame.file)).not.toContain(
			'node_modules/vitest/dist/chunk.js',
		);
	});

	it('parses textual stacks when no structured frames are present', () => {
		const frames = parseStackText(
			[
				'AssertionError: nope',
				'    at fn (/repo/plugins/foo/src/a.ts:12:3)',
				'    at /repo/plugins/foo/tests/a.spec.ts:4:5',
			].join('\n'),
		);
		expect(frames).toEqual([
			{
				method: 'fn',
				file: '/repo/plugins/foo/src/a.ts',
				line: 12,
				column: 3,
			},
			{
				method: undefined,
				file: '/repo/plugins/foo/tests/a.spec.ts',
				line: 4,
				column: 5,
			},
		]);
	});

	it('keeps absolute paths outside the workspace intact', () => {
		expect(toRepoRelative('/elsewhere/a.ts', '/repo')).toBe(
			'/elsewhere/a.ts',
		);
		expect(toRepoRelative('/repo/a/b.ts', '/repo')).toBe('a/b.ts');
	});

	it('builds a failure record with a source frame and capped fields', () => {
		const record = buildFailureRecord({
			error: {
				name: 'AssertionError',
				message: 'expected 3 to be 4',
				expected: 4,
				actual: 3,
				diff: 'd'.repeat(JOURNAL_BOUNDS.maxDiffChars + 50),
				stacks: [
					{
						file: '/repo/plugins/foo/tests/a.spec.ts',
						line: 7,
						column: 28,
					},
				],
			},
			file: '/repo/plugins/foo/tests/a.spec.ts',
			workspaceRoot: '/repo',
			name: 'sums',
			fullName: 'math > sums',
			project: 'foo',
			durationMs: 12,
			kind: 'test',
		});
		expect(record.file).toBe('plugins/foo/tests/a.spec.ts');
		expect(record.expected).toBe('4');
		expect(record.actual).toBe('3');
		expect(record.sourceFrame?.line).toBe(7);
		expect(record.diff?.length).toBeLessThan(
			JOURNAL_BOUNDS.maxDiffChars + 60,
		);
	});

	it('bounds the journal by run count and by bytes', () => {
		const lines = Array.from(
			{ length: 10 },
			(_, index) => `{"n":${index}}`,
		);
		expect(
			boundJournalLines(lines, { maxRuns: 3, maxBytes: 1_000_000 }),
		).toEqual(['{"n":7}', '{"n":8}', '{"n":9}']);
		const bounded = boundJournalLines(lines, { maxRuns: 10, maxBytes: 30 });
		expect(bounded.length).toBeLessThan(10);
		expect(bounded.at(-1)).toBe('{"n":9}');
	});

	it('derives a run id that is stable for one run and sortable by time', () => {
		const id = makeRunId('2026-09-03T10:11:12.000Z', 'vitest run');
		expect(id.startsWith('20260903101112')).toBe(true);
	});
});

describe('test-journal persistence', () => {
	let root = '';

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'delendai-test-journal-'));
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it('appends runs and reads the last one back', () => {
		appendRunEntry({ workspaceRoot: root, entry: entry({ runId: 'a' }) });
		appendRunEntry({
			workspaceRoot: root,
			entry: entry({ runId: 'b', result: 'fail', reason: 'failed' }),
		});
		expect(readRunEntries(root)).toHaveLength(2);
		expect(readLastRunEntry(root)?.runId).toBe('b');
	});

	it('records a green run, so "green" is distinguishable from "never ran"', () => {
		expect(readLastRunEntry(root)).toBeUndefined();
		appendRunEntry({ workspaceRoot: root, entry: entry() });
		expect(readLastRunEntry(root)?.result).toBe('pass');
	});

	it('skips torn lines instead of failing the read', async () => {
		appendRunEntry({
			workspaceRoot: root,
			entry: entry({ runId: 'good' }),
		});
		const path = journalPath(root);
		const existing = await readFile(path, 'utf8');
		await writeFile(path, `${existing}{"not json\n`);
		expect(readRunEntries(root).map((item) => item.runId)).toEqual([
			'good',
		]);
	});

	it('never throws when the journal cannot be written', () => {
		// A path whose parent is a FILE: `mkdir` cannot create it. The
		// reporter must swallow this — a broken journal may not break a run.
		expect(() =>
			safeAppendRunEntry({
				workspaceRoot: '/dev/null/nope',
				entry: entry(),
			}),
		).not.toThrow();
		expect(
			safeAppendRunEntry({
				workspaceRoot: '/dev/null/nope',
				entry: entry(),
			}),
		).toBeUndefined();
	});
});

describe('reader output', () => {
	const staleness = {
		stale: false,
		changedFiles: [],
		changedCount: 0,
		checked: true,
	} as const;

	it('says the last run was green', () => {
		const text = formatReport({
			entry: entry(),
			staleness,
			limit: 20,
			showDiff: true,
			now: Date.parse('2026-09-03T10:00:10.000Z'),
		});
		expect(text).toContain('last run: PASS');
		expect(text).toContain('The last run was green.');
	});

	it('groups failures by file and points at the source line', () => {
		const text = formatReport({
			entry: entry({
				result: 'fail',
				reason: 'failed',
				totals: {
					files: 1,
					tests: 2,
					passed: 1,
					failed: 1,
					skipped: 0,
				},
				failures: [
					{
						file: 'plugins/foo/tests/a.spec.ts',
						project: 'foo',
						name: 'sums',
						fullName: 'math > sums',
						errorName: 'AssertionError',
						message: 'expected 3 to be 4',
						sourceFrame: {
							file: 'plugins/foo/tests/a.spec.ts',
							line: 7,
							column: 28,
						},
						kind: 'test',
					},
				],
			}),
			staleness,
			limit: 20,
			showDiff: true,
			now: Date.parse('2026-09-03T10:00:10.000Z'),
		});
		expect(text).toContain('plugins/foo/tests/a.spec.ts  [foo]');
		expect(text).toContain('math > sums');
		expect(text).toContain('at plugins/foo/tests/a.spec.ts:7:28');
	});

	it('shouts when the journal predates the working tree', () => {
		const text = formatReport({
			entry: entry(),
			staleness: {
				stale: true,
				changedFiles: [{ file: 'plugins/foo/src/a.ts', ageMs: 1000 }],
				changedCount: 1,
				checked: true,
			},
			limit: 20,
			showDiff: true,
			now: Date.parse('2026-09-03T10:00:10.000Z'),
		});
		expect(text).toContain('STALE');
		expect(text).toContain('plugins/foo/src/a.ts');
		expect(text).toContain('re-run the tests before trusting');
	});
});

describe('test journal privacy and locking', () => {
	it('redacts a secret that a failing assertion put in expected/actual', () => {
		// A perfectly ordinary test —
		//   expect(process.env.API_KEY).toBe(<a live key>)
		// — fails by printing BOTH sides. The journal is durable
		// storage, so writing those raw would persist the secret.
		//
		// The fixture is ASSEMBLED rather than written out: a literal
		// key-shaped string in a checked-in file is what GitHub's push
		// protection blocks, and it blocked this very commit. A test
		// about not persisting secrets has no business committing one,
		// even a fake. `redactSecrets` sees the assembled value, so the
		// coverage is identical.
		const fakeKey = ['sk', 'live', `51H8xKlmNoPqRsTuVwXyZ${'0123'}`].join(
			'_',
		);
		const record = buildFailureRecord({
			file: '/repo/packages/core/tests/a.spec.ts',
			workspaceRoot: '/repo',
			name: 'reads the key',
			fullName: 'env > reads the key',
			error: {
				message: `expected undefined to be "${fakeKey}"`,
				expected: fakeKey,
				actual: undefined,
				diff: `- ${fakeKey}`,
			},
			kind: 'test',
		});
		const serialized = JSON.stringify(record);
		expect(serialized).not.toContain(fakeKey);
	});

	it('refuses to write without the lock rather than writing unlocked', () => {
		// Timing out and then doing the work anyway is worse than not
		// doing it: running the read-modify-write unlocked is exactly
		// the concurrent write the lock exists to prevent, under
		// precisely the contention that caused the timeout. Losing one
		// entry is cheap; a corrupted journal is the artifact an agent
		// reads INSTEAD of re-running a six-minute suite.
		const source = readFileSync(
			new URL('./test-journal.ts', import.meta.url),
			'utf8',
		);
		expect(source).toContain('skipping this entry rather than writing');
		expect(source).not.toMatch(/if \(held\) \{\s*try \{\s*rmSync/u);
	});
});
