/**
 * ref-attribution.spec.ts — x00550.
 *
 * A work ref names the agent that wrote it, and that agent need not be
 * one this machine has ever registered: the ref may come from another
 * machine, another host, or from before this machine registered anything.
 * Requiring a local `agents` row for it produced, in this repository:
 *
 *   foreign key violation in generations (row 1) referencing agents
 *   foreign key violation in work_units (row 1) referencing agents
 *   foreign key violation in work_unit_owners (row 1) referencing agents
 *
 * reported at startup as a corrupt state database, blocking every
 * mutation, over rows delendai itself had written. Attribution keeps its
 * value; claims and leases are still local facts and still refuse an
 * unknown agent.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadDatabaseClass } from '../../../../src/lib/bun-sqlite.helper';
import {
	MIGRATION_CHECKSUMS,
	MIGRATION_FILES,
} from '../../../../src/lib/migrations';

import { ClaimsRepo } from '../../../../src/lib/work-model/claims-repo';
import { GenerationsRepo } from '../../../../src/lib/work-model/generations-repo';
import { createStartupSchemaPort } from '../../../../src/lib/work-model/startup-schema-port';
import { WorkUnitsRepo } from '../../../../src/lib/work-model/work-units-repo';
import {
	makeFixture,
	ProposalsSqliteDriver,
	seedIdentity,
	TEST_REPOSITORY,
	type IWorkModelFixture,
} from './fixture';

/** The agent component of a ref written elsewhere; no local row exists. */
const FOREIGN_AGENT = 'DESKTOP-9CTQRS7';

const MIGRATIONS_DIR = fileURLToPath(
	new URL('../../../../src/lib/migrations', import.meta.url),
);

describe('work attributed to an agent this machine never registered', () => {
	let fixture: IWorkModelFixture;
	let driver: ProposalsSqliteDriver;

	beforeEach(() => {
		fixture = makeFixture('ref-attribution');
		driver = new ProposalsSqliteDriver({ path: fixture.dbPath });
	});

	afterEach(() => {
		driver.close();
		fixture.dispose();
	});

	it('is recorded, and the database still passes its integrity check', () => {
		const identity = seedIdentity(driver);
		const units = new WorkUnitsRepo(driver.handle);
		const unit = units.ensure({
			repositoryId: identity.repositoryId,
			repository: TEST_REPOSITORY,
			proposalUid: 'x00545',
			sliceUid: 'S1',
			createdByAgentId: FOREIGN_AGENT,
			now: 2_000,
		});
		units.changeOwner({
			uid: unit.uid,
			agentId: FOREIGN_AGENT,
			reason: 'claimed',
			now: 2_100,
		});
		new GenerationsRepo(driver.handle).record({
			workUnitId: unit.id,
			generation: 1,
			baseIntegrationSha: 'a'.repeat(40),
			wipRef: `refs/wip/${FOREIGN_AGENT}/x00545-S1-g1`,
			wipHeadSha: 'b'.repeat(40),
			patchDigest: 'c'.repeat(40),
			fileScope: ['src/a.ts'],
			checkpointKind: 'durability',
			authorAgentId: FOREIGN_AGENT,
			machineId: identity.machineId,
			now: 2_200,
		});

		const integrity = createStartupSchemaPort(
			driver.handle,
		).integrityCheck();
		expect(integrity).toEqual({ ok: true, problems: [] });
		expect(units.getByUid(unit.uid)?.createdByAgentId).toBe(FOREIGN_AGENT);
	});

	it('still refuses a claim from an agent that is not registered here', () => {
		const identity = seedIdentity(driver);
		const unit = new WorkUnitsRepo(driver.handle).ensure({
			repositoryId: identity.repositoryId,
			repository: TEST_REPOSITORY,
			proposalUid: 'x00545',
			sliceUid: 'S2',
			createdByAgentId: FOREIGN_AGENT,
			now: 3_000,
		});
		expect(() =>
			new ClaimsRepo(driver.handle).claim({
				repositoryId: identity.repositoryId,
				paths: ['src/a.ts'],
				ownerAgentId: FOREIGN_AGENT,
				leaseId: 'lease-1',
				workUnitId: unit.id,
				now: 3_100,
			}),
		).toThrow();
	});
});

describe('a database written before the attribution columns were freed', () => {
	let fixture: IWorkModelFixture;

	beforeEach(() => {
		fixture = makeFixture('ref-attribution-legacy');
	});
	afterEach(() => fixture.dispose());

	it('migrates, keeps its rows, and passes the integrity check', () => {
		// Build the schema as it was up to 0018, then write the row the
		// startup reconciler wrote through a connection with no foreign
		// keys: a work unit attributed to the agent named in a ref.
		const DatabaseClass = loadDatabaseClass('ref-attribution-legacy');
		const legacy = new DatabaseClass(fixture.dbPath, { create: true });
		legacy.exec('PRAGMA foreign_keys = OFF;');
		legacy.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			checksum TEXT NOT NULL,
			applied_at INTEGER NOT NULL
		);`);
		for (const name of MIGRATION_FILES) {
			const version = Number(name.slice(0, 4));
			if (version > 18) continue;
			legacy.exec(readFileSync(join(MIGRATIONS_DIR, name), 'utf8'));
			legacy
				.prepare(
					'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
				)
				.run(version, name, MIGRATION_CHECKSUMS[name] ?? '', 1_000);
		}
		legacy
			.prepare(
				`INSERT INTO repositories (
					forge, owner, name, integration_branch, release_branch,
					created_at, updated_at
				) VALUES ('github', 'acme', 'widgets', 'develop', 'main', 1000, 1000)`,
			)
			.run();
		legacy
			.prepare(
				`INSERT INTO work_units (
					uid, repository_id, proposal_uid, slice_uid, state,
					current_generation, current_owner_agent_id, created_by_agent_id,
					revision, created_at, updated_at
				) VALUES (?, 1, 'x00545', 'S1', 'pending', 1, ?, ?, 0, 1000, 1000)`,
			)
			.run('github:acme/widgets#x00545/S1', FOREIGN_AGENT, FOREIGN_AGENT);
		legacy.close();

		// The database as delendai opens it: the migration runs here.
		const driver = new ProposalsSqliteDriver({ path: fixture.dbPath });
		try {
			const port = createStartupSchemaPort(driver.handle);
			expect(port.currentVersion()).toBe(port.targetVersion());
			expect(port.integrityCheck()).toEqual({ ok: true, problems: [] });
			const unit = new WorkUnitsRepo(driver.handle).getByUid(
				'github:acme/widgets#x00545/S1',
			);
			expect(unit?.createdByAgentId).toBe(FOREIGN_AGENT);
		} finally {
			driver.close();
		}
	});
});
