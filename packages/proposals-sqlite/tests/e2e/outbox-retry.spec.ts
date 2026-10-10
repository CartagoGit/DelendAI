import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveProposalsDbPaths } from '../../src/lib/db-path';
import { OutboxProcessor } from '../../src/lib/outbox/processor';
import { OutboxRepo } from '../../src/lib/repository/outbox-repo';
import { ProposalsSqliteDriver } from '../../src/lib/sqlite-driver';

const makeTmpPath = (): { dir: string; path: string } => {
	const dir = mkdtempSync(join(tmpdir(), 'proposals-sqlite-outbox-e2e-'));
	return {
		dir,
		path: resolveProposalsDbPaths(dir, { stateDir: dir }).databasePath,
	};
};

describe('outbox retry recovery', () => {
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

	it('completes the side effect after a crashed worker is restarted', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const repo = new OutboxRepo(driver.handle);
			const queued = repo.enqueue({
				idempotencyKey: 'crash-recovery-1',
				kind: 'regenerate-index',
				payload: '{"proposalUid":"x00514"}',
				now: 100,
			});

			const crashedWorker = new OutboxProcessor(driver.handle, {
				workerId: 'crashed-worker',
				leaseDurationMs: 50,
				handlers: {
					'regenerate-index': () => {
						throw new Error('worker crashed');
					},
				},
			});
			expect(crashedWorker.tick(100).retried).toBe(1);

			const restartedCalls: string[] = [];
			const restartedWorker = new OutboxProcessor(driver.handle, {
				workerId: 'restarted-worker',
				handlers: {
					'regenerate-index': (record) =>
						restartedCalls.push(record.idempotencyKey),
				},
			});

			expect(restartedWorker.tick(1_099).completed).toBe(0);
			expect(restartedWorker.tick(1_100).completed).toBe(1);
			expect(restartedCalls).toEqual([queued.record.idempotencyKey]);
			expect(repo.listPending(1_100)).toHaveLength(0);
		} finally {
			driver.close();
		}
	});
});
