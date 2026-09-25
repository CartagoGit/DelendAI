/**
 * startup-state-ports.spec.ts — x00550 S2.
 *
 * The startup reconciler writes through its own connection. That
 * connection opened the database with `new Database(...)` and applied no
 * pragmas, so it enforced no foreign keys: a row the schema forbids was
 * accepted here and reported days later, at somebody else's startup, as a
 * corrupt state database. It now uses the same pragmas as every other
 * connection, so an invalid write fails where it is made.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openStartupStatePorts } from '../../../../src/lib/work-model/startup-state-ports';
import {
	makeFixture,
	ProposalsSqliteDriver,
	seedIdentity,
	TEST_REPOSITORY,
	type IWorkModelFixture,
} from './fixture';

describe('the connection the startup reconciler writes through', () => {
	let fixture: IWorkModelFixture;

	beforeEach(() => {
		fixture = makeFixture('startup-ports');
	});
	afterEach(() => fixture.dispose());

	it('enforces the foreign keys the schema declares', () => {
		// Seed through the ordinary driver, then reopen as startup does.
		const driver = new ProposalsSqliteDriver({ path: fixture.dbPath });
		const identity = seedIdentity(driver);
		driver.close();

		const opened = openStartupStatePorts({
			databasePath: fixture.dbPath,
			allowCreate: true,
		});
		expect(opened.kind).toBe('opened');
		if (opened.kind !== 'opened') throw new Error('unreachable');
		const unit = opened.ports.workUnits.ensure({
			repositoryId: identity.repositoryId,
			repository: TEST_REPOSITORY,
			proposalUid: 'x00550',
			sliceUid: 'S2',
			createdByAgentId: 'DESKTOP-9CTQRS7',
			now: 1_000,
		});

		// The machine a generation was produced on IS a local fact, and its
		// foreign key still holds: a generation from a machine nobody
		// registered is refused here, instead of landing and being reported
		// as corruption later.
		expect(() =>
			opened.ports.generations.record({
				workUnitId: unit.id,
				generation: 1,
				baseIntegrationSha: 'a'.repeat(40),
				wipRef: 'refs/wip/DESKTOP-9CTQRS7/x00550-S2-g1',
				wipHeadSha: 'b'.repeat(40),
				patchDigest: 'c'.repeat(40),
				fileScope: ['src/a.ts'],
				checkpointKind: 'durability',
				authorAgentId: 'DESKTOP-9CTQRS7',
				machineId: 'machine-nobody-registered',
				now: 1_100,
			}),
		).toThrow();
		// And the database it wrote through is still whole.
		expect(opened.ports.schema.integrityCheck()).toEqual({
			ok: true,
			problems: [],
		});
	});

	it('opens an existing database when it may not create one', () => {
		new ProposalsSqliteDriver({ path: fixture.dbPath }).close();

		const opened = openStartupStatePorts({
			databasePath: fixture.dbPath,
			allowCreate: false,
		});

		expect(opened.kind).toBe('opened');
	});

	it('reports a missing database as absent when it may not create one', () => {
		expect(
			openStartupStatePorts({
				databasePath: `${fixture.dbPath}.missing`,
				allowCreate: false,
			}),
		).toEqual({ kind: 'absent' });
	});
});
