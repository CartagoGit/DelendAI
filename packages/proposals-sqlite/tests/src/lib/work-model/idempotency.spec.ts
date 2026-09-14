/**
 * idempotency.spec.ts — "insert it twice, get one row".
 *
 * The work-model database is rebuilt by re-observing the forge, so
 * every writer is called again with facts it has already seen. These
 * specs pin that as a property of the SCHEMA (UNIQUE constraints and
 * ABORT triggers), not of caller discipline — including the case where
 * a caller bypasses the repository layer and writes raw SQL.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CoordinationJournalRepo } from '../../../../src/lib/work-model/journal-repo';
import { GenerationsRepo } from '../../../../src/lib/work-model/generations-repo';
import { WorkUnitsRepo } from '../../../../src/lib/work-model/work-units-repo';
import {
	makeFixture,
	ProposalsSqliteDriver,
	seedIdentity,
	TEST_REPOSITORY,
	type IWorkModelFixture,
} from './fixture';

describe('work model idempotency', () => {
	let fixture: IWorkModelFixture;
	let driver: ProposalsSqliteDriver;

	beforeEach(() => {
		fixture = makeFixture('idempotency');
		driver = new ProposalsSqliteDriver({ path: fixture.dbPath });
	});

	afterEach(() => {
		driver.close();
		fixture.dispose();
	});

	const seedWorkUnit = () => {
		const identity = seedIdentity(driver);
		const workUnit = new WorkUnitsRepo(driver.handle).ensure({
			repositoryId: identity.repositoryId,
			repository: TEST_REPOSITORY,
			proposalUid: 'f00777',
			sliceUid: 'f00777-s1',
			createdByAgentId: identity.agentId,
			now: 1_000,
		});
		return { ...identity, workUnit };
	};

	it('records the same generation twice without duplicating it', () => {
		const { workUnit, agentId, machineId } = seedWorkUnit();
		const repo = new GenerationsRepo(driver.handle);
		const args = {
			workUnitId: workUnit.id,
			generation: 1,
			baseIntegrationSha: 'base0001',
			wipRef: 'refs/wip/agent-1/f00777/s1',
			wipHeadSha: 'wip0001',
			patchDigest: 'patch0001',
			// Deliberately unsorted and duplicated: the canonical form
			// must absorb both.
			fileScope: ['src/b.ts', 'src/a.ts', 'src/b.ts'],
			checkpointKind: 'durability' as const,
			authorAgentId: agentId,
			machineId,
			now: 2_000,
		};
		const first = repo.record(args);
		const second = repo.record({ ...args, now: 3_000 });

		expect(second.id).toBe(first.id);
		expect(second.fileScope).toEqual(['src/a.ts', 'src/b.ts']);
		expect(second.fileScopeDigest).toBe(first.fileScopeDigest);
		const count = driver.handle
			.query<{ count: number }, [number]>(
				'SELECT COUNT(*) AS count FROM generations WHERE work_unit_id = ?',
			)
			.get(workUnit.id);
		expect(count?.count).toBe(1);
	});

	it('rejects a duplicate (work unit, generation) written as raw SQL', () => {
		const { workUnit, agentId, machineId } = seedWorkUnit();
		const insert = (): void => {
			driver.handle
				.prepare(
					`INSERT INTO generations (
						work_unit_id, generation, base_integration_sha, wip_ref,
						wip_head_sha, patch_digest, file_scope_json,
						file_scope_digest, checkpoint_kind, candidate_state,
						validation_state, author_agent_id, machine_id, revision,
						created_at, updated_at
					) VALUES (?, 7, 'b', 'r', 'w', 'p', '[]', 'd', 'durability',
						'draft', 'unknown', ?, ?, 0, 1, 1)`,
				)
				.run(workUnit.id, agentId, machineId);
		};
		insert();
		expect(insert).toThrow(/UNIQUE constraint failed/);
	});

	it('creates a work unit once even when ensure() is called repeatedly', () => {
		const identity = seedIdentity(driver);
		const repo = new WorkUnitsRepo(driver.handle);
		const args = {
			repositoryId: identity.repositoryId,
			repository: TEST_REPOSITORY,
			proposalUid: 'f00777',
			sliceUid: 'f00777-s1',
			createdByAgentId: identity.agentId,
			now: 1_000,
		};
		const a = repo.ensure(args);
		const b = repo.ensure({ ...args, now: 5_000 });
		expect(b.id).toBe(a.id);
		expect(b.createdAt).toBe(1_000);
		const owners = repo.ownershipHistory(a.uid);
		expect(owners).toHaveLength(1);
		expect(owners[0]?.seq).toBe(0);
		expect(owners[0]?.reason).toBe('created');
	});

	it('appends the same journal event id only once', () => {
		const journal = new CoordinationJournalRepo(driver.handle);
		const event = {
			eventKind: 'slice-recovered' as const,
			workUnitUid: 'github:acme/widgets#f00777/f00777-s1',
			actorAgentId: 'agent-1',
			occurredAt: 4_000,
			// Different key order on purpose: the canonical payload must
			// make both writes produce the same deterministic id.
			payload: { reason: 'lease expired', from: 'agent-0' },
		};
		const first = journal.append(event);
		const second = journal.append({
			...event,
			payload: { from: 'agent-0', reason: 'lease expired' },
			recordedAt: 9_999,
		});

		expect(first.appended).toBe(true);
		expect(second.appended).toBe(false);
		expect(second.event.eventId).toBe(first.event.eventId);
		expect(journal.listAll()).toHaveLength(1);
	});

	it('keeps the journal append-only: UPDATE and DELETE abort', () => {
		const journal = new CoordinationJournalRepo(driver.handle);
		journal.append({
			eventKind: 'slice-deprecated',
			workUnitUid: 'github:acme/widgets#f00777/f00777-s1',
			occurredAt: 5_000,
			payload: { reason: 'superseded by f00778' },
		});

		expect(() =>
			driver.handle
				.prepare('UPDATE coordination_journal SET occurred_at = 1')
				.run(),
		).toThrow(/append-only/);
		expect(() =>
			driver.handle.prepare('DELETE FROM coordination_journal').run(),
		).toThrow(/append-only/);
		expect(journal.listAll()).toHaveLength(1);
	});
});
