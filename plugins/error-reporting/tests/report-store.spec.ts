import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createReportStore } from '../src/lib/report-store.service';

const tmpDirs: string[] = [];

const makeDir = async (): Promise<string> => {
	const dir = await mkdtemp(join(tmpdir(), 'error-reporting-'));
	tmpDirs.push(dir);
	return dir;
};

afterEach(async () => {
	await Promise.all(
		tmpDirs
			.splice(0)
			.map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe('createReportStore', () => {
	it('records attempts and then stores a success separately', async () => {
		const store = createReportStore(await makeDir());
		await store.recordAttempt('tool_x::boom', {
			at: '2026-08-24T00:00:00.000Z',
			classification: 'BUG',
		});
		await store.recordSuccess('tool_x::boom', {
			issueNumber: 42,
			issueUrl: 'https://github.com/o/r/issues/42',
			at: '2026-08-24T00:00:00.000Z',
		});
		const record = await store.get('tool_x::boom');
		expect(record).toBeDefined();
		expect(record?.classification).toBe('BUG');
		expect(record?.issueNumber).toBe(42);
		expect(record?.attemptCount).toBe(1);
		expect(record?.lastSuccessAt).toBe('2026-08-24T00:00:00.000Z');
	});

	it('increments attempt count without blocking success metadata reuse', async () => {
		const store = createReportStore(await makeDir());
		await store.recordAttempt('sig', {
			at: '2026-08-24T00:00:00.000Z',
			classification: 'PERFORMANCE',
		});
		await store.recordSuccess('sig', {
			issueNumber: 1,
			at: '2026-08-24T00:00:00.000Z',
		});
		await store.recordAttempt('sig', {
			at: '2026-08-24T01:00:00.000Z',
			classification: 'PERFORMANCE',
		});
		const record = await store.get('sig');
		expect(record?.attemptCount).toBe(2);
		expect(record?.classification).toBe('PERFORMANCE');
		expect(record?.issueNumber).toBe(1);
		expect(record?.lastAttemptAt).toBe('2026-08-24T01:00:00.000Z');
		expect(record?.lastSuccessAt).toBe('2026-08-24T00:00:00.000Z');
	});

	it('records failed dispatch state without mutating lastSuccessAt', async () => {
		const store = createReportStore(await makeDir());
		await store.recordAttempt('sig', {
			at: '2026-08-24T00:00:00.000Z',
			classification: 'PRIVACY',
		});
		await store.recordFailure('sig', {
			at: '2026-08-24T00:00:00.000Z',
			failureCode: 'GH_EXEC_FAILED',
			nextEligibleAt: '2026-08-24T00:01:00.000Z',
		});
		const record = await store.get('sig');
		expect(record?.attemptCount).toBe(1);
		expect(record?.classification).toBe('PRIVACY');
		expect(record?.lastFailureCode).toBe('GH_EXEC_FAILED');
		expect(record?.lastSuccessAt).toBeUndefined();
		expect(record?.consecutiveFailureCount).toBe(1);
		expect(record?.nextEligibleAt).toBe('2026-08-24T00:01:00.000Z');
	});

	it('allows only one concurrent dispatch claim and recovers expired claims', async () => {
		const store = createReportStore(await makeDir());
		const claims = await Promise.all([
			store.claimDispatch(
				'fp',
				'2026-08-24T00:05:00.000Z',
				'2026-08-24T00:00:00.000Z',
			),
			store.claimDispatch(
				'fp',
				'2026-08-24T00:05:00.000Z',
				'2026-08-24T00:00:00.000Z',
			),
		]);

		expect(claims.filter(Boolean)).toHaveLength(1);
		expect(
			await store.claimDispatch(
				'fp',
				'2026-08-24T00:10:00.000Z',
				'2026-08-24T00:06:00.000Z',
			),
		).toBe(true);
	});

	it('migrates legacy signature records and treats success only when an issue exists', async () => {
		const dir = await makeDir();
		await import('node:fs/promises').then(({ writeFile }) =>
			writeFile(
				join(dir, 'reported.json'),
				JSON.stringify({
					legacy_sig: {
						signature: 'legacy_sig',
						count: 2,
						lastReportedAt: '2026-08-24T02:00:00.000Z',
						issueNumber: 9,
					},
				}),
				'utf8',
			),
		);
		const store = createReportStore(dir);
		const record = await store.get('legacy_sig');
		expect(record?.fingerprint).toBe('legacy_sig');
		expect(record?.classification).toBe('UNKNOWN');
		expect(record?.attemptCount).toBe(2);
		expect(record?.lastSuccessAt).toBe('2026-08-24T02:00:00.000Z');
	});

	it('returns undefined for an unknown signature and tolerates a corrupt file', async () => {
		const dir = await makeDir();
		const store = createReportStore(dir);
		expect(await store.get('missing')).toBeUndefined();
		await import('node:fs/promises').then(({ writeFile }) =>
			writeFile(join(dir, 'reported.json'), '{not json', 'utf8'),
		);
		expect(await store.get('missing')).toBeUndefined();
	});
});

describe('report store — a state file we cannot read', () => {
	// `catch { return {} }` collapsed "missing" and "unreadable" into the
	// same answer, and the next write persisted that emptiness over the
	// real file. This store is what stops a recurring failure from
	// opening a SECOND GitHub issue for the same fingerprint, so losing
	// it means delendai re-reports everything it has ever reported —
	// into the user's repository.
	let dir = '';
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'error-reporting-store-corrupt-'));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it('does not overwrite a corrupt state file with an empty one', async () => {
		const statePath = join(dir, 'reported.json');
		const corrupt = '{"abc": {"fingerprint": "abc", tor';
		await writeFile(statePath, corrupt, 'utf8');

		const store = createReportStore(dir);
		await store.recordAttempt('abc', {
			classification: 'BUG',
			at: new Date().toISOString(),
		});

		// The bytes are evidence of a torn write. Destroying them loses
		// the de-duplication history AND any chance of diagnosing it.
		expect(await readFile(statePath, 'utf8')).toBe(corrupt);
	});

	it('still treats a MISSING file as an empty state, which it is', async () => {
		const store = createReportStore(dir);
		await store.recordAttempt('abc', {
			classification: 'BUG',
			at: new Date().toISOString(),
		});
		expect((await store.all()).map((record) => record.fingerprint)).toEqual(
			['abc'],
		);
	});
});
