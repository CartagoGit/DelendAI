import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PlanRepo } from '../../../../src/lib/repository/plans-repo';
import { ProposalRepo } from '../../../../src/lib/repository/proposals-repo';
import { ProposalsSqliteDriver } from '../../../../src/lib/sqlite-driver';
import { SliceRepo } from '../../../../src/lib/repository/slices-repo';
import { resolveProposalsDbPaths } from '../../../../src/lib/db-path';

const makeTmpPath = (): { dir: string; path: string } => {
	const dir = mkdtempSync(
		join(tmpdir(), 'proposals-sqlite-lifecycle-hooks-'),
	);
	return {
		dir,
		path: resolveProposalsDbPaths(dir, { stateDir: dir }).databasePath,
	};
};

describe('lifecycle hooks (f00514 S1)', () => {
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

	it('pairs proposal close and plan/slice transitions with lifecycle rows', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const proposal = new ProposalRepo(driver.handle).upsertProjection(
				{
					uid: 'x00514',
					slug: 'x00514',
					path: 'ready/fixes/x00514.md',
					title: 'Lifecycle hooks',
					kind: 'fix',
					status: 'ready',
					type: 'proposal',
					track: 'architecture',
					bodyHash: 'hash',
				},
				100,
			).proposal;

			const planRepo = new PlanRepo(driver.handle);
			planRepo.create({
				uid: 'x00514',
				proposalId: proposal.id,
				slug: 'x00514',
				title: 'Lifecycle hooks',
				now: 110,
			});
			const sliceRepo = new SliceRepo(driver.handle);
			sliceRepo.create({
				uid: 'x00514.S1',
				planId: planRepo.getByUid('x00514')?.id ?? 0,
				slug: 'x00514-s1',
				title: 'Hooks',
				now: 110,
			});

			const closed = new ProposalRepo(driver.handle).closeProposal({
				uid: 'x00514',
				actor: 'test',
				source: 'lifecycle-hooks-test',
				now: 120,
			});
			expect(closed.kind).toBe('closed');
			const planTransition = planRepo.transitionStatus({
				uid: 'x00514',
				toStatus: 'review',
				actor: 'test',
				source: 'lifecycle-hooks-test',
				now: 130,
			});
			expect(planTransition.kind).toBe('transitioned');
			const sliceTransition = sliceRepo.transitionStatus({
				uid: 'x00514.S1',
				toStatus: 'review',
				actor: 'test',
				source: 'lifecycle-hooks-test',
				now: 140,
			});
			expect(sliceTransition.kind).toBe('transitioned');

			expect(
				driver.handle
					.query<
						{
							readonly entity_type: string;
							readonly entity_uid: string;
						},
						[]
					>(
						'SELECT entity_type, entity_uid FROM lifecycle_events ORDER BY id',
					)
					.all(),
			).toEqual([
				{ entity_type: 'proposal', entity_uid: 'x00514' },
				{ entity_type: 'plan', entity_uid: 'x00514' },
				{ entity_type: 'slice', entity_uid: 'x00514.S1' },
			]);
		} finally {
			driver.close();
		}
	});

	it('rolls back the entity update and lifecycle event together', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const proposalRepo = new ProposalRepo(driver.handle);
			proposalRepo.upsertProjection(
				{
					uid: 'x00514',
					slug: 'x00514',
					path: 'ready/fixes/x00514.md',
					title: 'Lifecycle hooks',
					kind: 'fix',
					status: 'ready',
					type: 'proposal',
					track: 'architecture',
					bodyHash: 'hash',
				},
				100,
			);
			driver.handle.exec(`
				CREATE TRIGGER lifecycle_hooks_abort
				AFTER INSERT ON lifecycle_events
				BEGIN
					SELECT RAISE(ABORT, 'lifecycle hook failure');
				END;
			`);

			expect(() =>
				proposalRepo.closeProposal({
					uid: 'x00514',
					actor: 'test',
					source: 'lifecycle-hooks-test',
					now: 120,
				}),
			).toThrow(/lifecycle hook failure/);
			expect(proposalRepo.getByUid('x00514')?.status).toBe('ready');
			expect(
				driver.handle.query('SELECT id FROM lifecycle_events').all(),
			).toHaveLength(0);
		} finally {
			driver.close();
		}
	});
});
