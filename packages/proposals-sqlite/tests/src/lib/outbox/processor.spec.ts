import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveProposalsDbPaths } from '../../../../src/lib/db-path';
import { OutboxProcessor } from '../../../../src/lib/outbox/processor';
import { ProposalsSqliteDriver } from '../../../../src/lib/sqlite-driver';
import { OutboxRepo } from '../../../../src/lib/repository/outbox-repo';

const makeTmpPath = (): { dir: string; path: string } => {
	const dir = mkdtempSync(join(tmpdir(), 'proposals-sqlite-processor-'));
	return {
		dir,
		path: resolveProposalsDbPaths(dir, { stateDir: dir }).databasePath,
	};
};

describe('OutboxProcessor', () => {
	let tmpDir: string;
	let dbPath: string;

	beforeEach(() => {
		const tmp = makeTmpPath();
		tmpDir = tmp.dir;
		dbPath = tmp.path;
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it('delivers due work and marks it done', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const repo = new OutboxRepo(driver.handle);
			const queued = repo.enqueue({
				idempotencyKey: 'done-1',
				kind: 'notify-agent',
				payload: '{}',
				nextAttemptAt: 10,
				now: 0,
			});
			const delivered: number[] = [];
			const processor = new OutboxProcessor(driver.handle, {
				workerId: 'worker-1',
				handlers: {
					'notify-agent': (record) => delivered.push(record.id),
				},
			});

			expect(processor.tick(9)).toEqual({
				claimed: 0,
				completed: 0,
				retried: 0,
				failed: 0,
				busy: 0,
			});
			expect(processor.tick(10).completed).toBe(1);
			expect(delivered).toEqual([queued.record.id]);
			expect(repo.listPending(10)).toHaveLength(0);
		} finally {
			driver.close();
		}
	});

	it('reclaims an expired lease after a restart', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const repo = new OutboxRepo(driver.handle);
			const queued = repo.enqueue({
				idempotencyKey: 'reclaim-1',
				kind: 'regenerate-index',
				payload: '{}',
				now: 0,
			});
			repo.markInFlight({
				id: queued.record.id,
				leaseOwner: 'crashed-worker',
				leaseDurationMs: 10,
				now: 0,
			});
			const calls: string[] = [];
			const processor = new OutboxProcessor(driver.handle, {
				workerId: 'restarted-worker',
				handlers: {
					'regenerate-index': (record) =>
						calls.push(record.idempotencyKey),
				},
			});

			expect(processor.tick(9).claimed).toBe(0);
			expect(processor.tick(10).completed).toBe(1);
			expect(calls).toEqual(['reclaim-1']);
		} finally {
			driver.close();
		}
	});

	it('retries with exponential backoff and fails after ten attempts', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const repo = new OutboxRepo(driver.handle);
			repo.enqueue({
				idempotencyKey: 'retry-1',
				kind: 'regenerate-index',
				payload: '{}',
				now: 0,
			});
			const processor = new OutboxProcessor(driver.handle, {
				workerId: 'worker-1',
				handlers: {
					'regenerate-index': () => {
						throw new Error('temporary failure');
					},
				},
			});
			const tickTimes = [
				0, 1_000, 3_000, 7_000, 15_000, 31_000, 63_000, 123_000,
				183_000, 243_000,
			];
			for (const now of tickTimes) processor.tick(now);

			const failed = driver.handle
				.query<
					{ status: string; attempts: number; last_error: string },
					[string]
				>(
					'SELECT status, attempts, last_error FROM outbox WHERE idempotency_key = ?',
				)
				.get('retry-1');
			expect(failed).toEqual({
				status: 'failed',
				attempts: 10,
				last_error: 'temporary failure',
			});
			expect(repo.listPending(243_000)).toHaveLength(0);
		} finally {
			driver.close();
		}
	});
});
