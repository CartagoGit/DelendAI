/**
 * leases-and-claims.spec.ts — liveness and path exclusion.
 *
 * Liveness is a pure function of stored data and a clock the caller
 * supplies, so the specs can move time forward without sleeping and
 * without a background reaper having to have run. Path exclusion is
 * asserted against the partial unique index, i.e. against SQLite,
 * not against a check this repo performs first.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClaimsRepo } from '../../../../src/lib/work-model/claims-repo';
import {
	isLeaseLive,
	LeasesRepo,
} from '../../../../src/lib/work-model/leases-repo';
import { leaseId } from '../../../../src/lib/work-model/ids';
import { WorkUnitsRepo } from '../../../../src/lib/work-model/work-units-repo';
import {
	makeFixture,
	ProposalsSqliteDriver,
	seedIdentity,
	TEST_REPOSITORY,
	type IWorkModelFixture,
} from './fixture';

const TTL = 60_000;

describe('leases and claims', () => {
	let fixture: IWorkModelFixture;
	let driver: ProposalsSqliteDriver;

	beforeEach(() => {
		fixture = makeFixture('leases');
		driver = new ProposalsSqliteDriver({ path: fixture.dbPath });
	});

	afterEach(() => {
		driver.close();
		fixture.dispose();
	});

	const acquire = (agentId: string, machineId: string, at: number) => {
		const repo = new LeasesRepo(driver.handle);
		return repo.acquire({
			id: leaseId({
				ownerAgentId: agentId,
				machineId,
				sessionId: 'session-1',
				acquiredAt: at,
			}),
			ownerAgentId: agentId,
			machineId,
			processId: 4242,
			sessionId: 'session-1',
			acquiredAt: at,
			ttlMs: TTL,
		});
	};

	it('distinguishes a live lease from an expired one', () => {
		const identity = seedIdentity(driver);
		const repo = new LeasesRepo(driver.handle);
		const lease = acquire(identity.agentId, identity.machineId, 10_000);

		expect(isLeaseLive(lease, 10_001)).toBe(true);
		expect(repo.listLive(10_001).map((row) => row.id)).toEqual([lease.id]);
		expect(repo.listExpired(10_001)).toEqual([]);

		const afterExpiry = 10_000 + TTL + 1;
		expect(isLeaseLive(lease, afterExpiry)).toBe(false);
		expect(repo.listLive(afterExpiry)).toEqual([]);
		expect(repo.listExpired(afterExpiry).map((row) => row.id)).toEqual([
			lease.id,
		]);
	});

	it('refuses to heartbeat a lease that already expired', () => {
		const identity = seedIdentity(driver);
		const repo = new LeasesRepo(driver.handle);
		const lease = acquire(identity.agentId, identity.machineId, 10_000);

		expect(repo.heartbeat(lease.id, 20_000, TTL)?.expiresAt).toBe(80_000);
		expect(repo.heartbeat(lease.id, 200_000, TTL)).toBeNull();
	});

	it('expires a lease exactly once', () => {
		const identity = seedIdentity(driver);
		const repo = new LeasesRepo(driver.handle);
		const lease = acquire(identity.agentId, identity.machineId, 10_000);
		const at = 10_000 + TTL + 1;

		expect(repo.expire(lease.id, at).kind).toBe('expired');
		expect(repo.expire(lease.id, at).kind).toBe('not_expirable');
	});

	it('gives one agent the whole scope and reports the conflicting paths to the other', () => {
		const identity = seedIdentity(driver);
		driver.handle
			.prepare(
				`INSERT INTO agents (id, host, model, machine_id, state, first_seen, last_seen)
				 VALUES ('agent-2', 'codex', NULL, ?, 'working', 1, 1)`,
			)
			.run(identity.machineId);
		const leaseA = acquire(identity.agentId, identity.machineId, 10_000);
		const leaseB = acquire('agent-2', identity.machineId, 10_001);

		const workUnits = new WorkUnitsRepo(driver.handle);
		const unitA = workUnits.ensure({
			repositoryId: identity.repositoryId,
			repository: TEST_REPOSITORY,
			proposalUid: 'f00777',
			sliceUid: 'f00777-s1',
			createdByAgentId: identity.agentId,
			now: 1_000,
		});
		const unitB = workUnits.ensure({
			repositoryId: identity.repositoryId,
			repository: TEST_REPOSITORY,
			proposalUid: 'f00777',
			sliceUid: 'f00777-s2',
			createdByAgentId: 'agent-2',
			now: 1_000,
		});

		const claims = new ClaimsRepo(driver.handle);
		const first = claims.claim({
			repositoryId: identity.repositoryId,
			paths: ['src/a.ts', 'src/b.ts'],
			ownerAgentId: identity.agentId,
			leaseId: leaseA.id,
			workUnitId: unitA.id,
			now: 11_000,
		});
		expect(first.kind).toBe('claimed');

		const second = claims.claim({
			repositoryId: identity.repositoryId,
			paths: ['src/b.ts', 'src/c.ts'],
			ownerAgentId: 'agent-2',
			leaseId: leaseB.id,
			workUnitId: unitB.id,
			now: 11_500,
		});
		expect(second).toEqual({ kind: 'conflict', conflicting: ['src/b.ts'] });
		// The losing batch is rolled back whole: `src/c.ts` must NOT be
		// half-claimed by agent-2.
		expect(claims.holderOf(identity.repositoryId, 'src/c.ts')).toBeNull();
		expect(claims.activeForWorkUnit(unitB.id)).toEqual([]);

		const released = claims.releaseClaimsOfExpiredLeases(10_000 + TTL + 1);
		expect(released).toBe(2);
		const retry = claims.claim({
			repositoryId: identity.repositoryId,
			paths: ['src/b.ts'],
			ownerAgentId: 'agent-2',
			leaseId: leaseB.id,
			workUnitId: unitB.id,
			now: 99_000,
		});
		expect(retry.kind).toBe('claimed');
	});
});
