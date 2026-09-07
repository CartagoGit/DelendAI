import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ProposalsSqliteDriver } from '../../../../src/lib/sqlite-driver';
import { OutboxRepo } from '../../../../src/lib/repository/outbox-repo';

const makeTmpPath = (): { dir: string; path: string } => {
	const dir = mkdtempSync(join(tmpdir(), 'proposals-sqlite-outbox-'));
	return { dir, path: join(dir, 'proposals.sqlite') };
};

describe('OutboxRepo (q00022 S3 / f00514 S2)', () => {
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

	it('dedupes enqueue by idempotency key', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const repo = new OutboxRepo(driver.handle);
			const first = repo.enqueue({
				idempotencyKey: 'idem-1',
				kind: 'regenerate-index',
				payload: '{}',
				now: 100,
			});
			const second = repo.enqueue({
				idempotencyKey: 'idem-1',
				kind: 'regenerate-index',
				payload: '{}',
				now: 101,
			});

			expect(first.kind).toBe('enqueued');
			expect(second.kind).toBe('already_enqueued');
			expect(second.record.id).toBe(first.record.id);
		} finally {
			driver.close();
		}
	});

	it('lists pending rows and advances them through in-flight and terminal states', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const repo = new OutboxRepo(driver.handle);
			const queued = repo.enqueue({
				idempotencyKey: 'idem-1',
				kind: 'regenerate-index',
				payload: '{}',
				nextAttemptAt: 100,
				now: 100,
			});
			const pending = repo.listPending(100);
			expect(pending).toHaveLength(1);
			expect(pending[0]?.id).toBe(queued.record.id);

			const inFlight = repo.markInFlight({
				id: queued.record.id,
				leaseOwner: 'worker-1',
				leaseDurationMs: 50,
				now: 120,
			});
			expect(inFlight.kind).toBe('claimed');
			if (inFlight.kind !== 'claimed') return;
			expect(inFlight.record.status).toBe('in-flight');
			expect(inFlight.record.attempts).toBe(1);
			expect(inFlight.record.leaseOwner).toBe('worker-1');
			expect(inFlight.record.leaseExpiresAt).toBe(170);
			expect(repo.listPending(200)).toHaveLength(1);

			const done = repo.markDone({
				id: queued.record.id,
				leaseOwner: 'worker-1',
				now: 130,
			});
			expect(done.kind).toBe('settled');
			if (done.kind !== 'settled') return;
			expect(done.record.status).toBe('done');
			expect(done.record.lastError).toBeNull();
			expect(done.record.leaseOwner).toBeNull();
			expect(done.record.leaseExpiresAt).toBeNull();

			const queuedFailure = repo.enqueue({
				idempotencyKey: 'idem-2',
				kind: 'regenerate-index',
				payload: '{}',
				nextAttemptAt: 200,
				now: 200,
			});
			const claimedFailure = repo.markInFlight({
				id: queuedFailure.record.id,
				leaseOwner: 'worker-2',
				leaseDurationMs: 50,
				now: 210,
			});
			expect(claimedFailure.kind).toBe('claimed');

			const failed = repo.markFailed({
				id: queuedFailure.record.id,
				leaseOwner: 'worker-2',
				lastError: 'temporary-failure',
				nextAttemptAt: 500,
				now: 220,
			});
			expect(failed.kind).toBe('settled');
			if (failed.kind !== 'settled') return;
			expect(failed.record.status).toBe('failed');
			expect(failed.record.lastError).toBe('temporary-failure');
			expect(failed.record.leaseOwner).toBeNull();
			expect(failed.record.leaseExpiresAt).toBeNull();
		} finally {
			driver.close();
		}
	});

	it('reclaims expired in-flight rows but not active leases', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const repo = new OutboxRepo(driver.handle);
			const expired = repo.enqueue({
				idempotencyKey: 'idem-expired',
				kind: 'regenerate-index',
				payload: '{}',
				nextAttemptAt: 100,
				now: 100,
			});
			const active = repo.enqueue({
				idempotencyKey: 'idem-active',
				kind: 'regenerate-index',
				payload: '{}',
				nextAttemptAt: 100,
				now: 100,
			});

			repo.markInFlight({
				id: expired.record.id,
				leaseOwner: 'worker-expired',
				leaseDurationMs: 20,
				now: 120,
			});
			repo.markInFlight({
				id: active.record.id,
				leaseOwner: 'worker-active',
				leaseDurationMs: 200,
				now: 120,
			});

			const reclaimable = repo.listPending(150);
			expect(reclaimable).toHaveLength(1);
			expect(reclaimable[0]?.id).toBe(expired.record.id);
			expect(reclaimable[0]?.leaseOwner).toBe('worker-expired');

			expect(repo.listPending(319)).toHaveLength(1);
			expect(repo.listPending(320)).toHaveLength(2);
		} finally {
			driver.close();
		}
	});

	it('refuses double-claim before expiry and refuses stale workers settling after takeover', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const repo = new OutboxRepo(driver.handle);
			const queued = repo.enqueue({
				idempotencyKey: 'idem-race',
				kind: 'regenerate-index',
				payload: '{}',
				nextAttemptAt: 100,
				now: 100,
			});

			const firstClaim = repo.markInFlight({
				id: queued.record.id,
				leaseOwner: 'worker-a',
				leaseDurationMs: 50,
				now: 120,
			});
			expect(firstClaim.kind).toBe('claimed');

			const secondClaim = repo.markInFlight({
				id: queued.record.id,
				leaseOwner: 'worker-b',
				leaseDurationMs: 50,
				now: 121,
			});
			expect(secondClaim.kind).toBe('busy');
			if (secondClaim.kind !== 'busy') return;
			expect(secondClaim.record.leaseOwner).toBe('worker-a');

			const takeover = repo.markInFlight({
				id: queued.record.id,
				leaseOwner: 'worker-b',
				leaseDurationMs: 50,
				now: 171,
			});
			expect(takeover.kind).toBe('claimed');
			if (takeover.kind !== 'claimed') return;
			expect(takeover.record.leaseOwner).toBe('worker-b');

			const staleDone = repo.markDone({
				id: queued.record.id,
				leaseOwner: 'worker-a',
				now: 172,
			});
			expect(staleDone.kind).toBe('busy');
			if (staleDone.kind !== 'busy') return;
			expect(staleDone.record.leaseOwner).toBe('worker-b');

			const freshDone = repo.markDone({
				id: queued.record.id,
				leaseOwner: 'worker-b',
				now: 173,
			});
			expect(freshDone.kind).toBe('settled');
		} finally {
			driver.close();
		}
	});
});
