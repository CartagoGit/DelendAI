import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LifecycleRepo } from '../../../../src/lib/repository/lifecycle-repo';
import { PlanRepo } from '../../../../src/lib/repository/plans-repo';
import { ProposalRepo } from '../../../../src/lib/repository/proposals-repo';
import { SliceRepo } from '../../../../src/lib/repository/slices-repo';
import { ProposalsSqliteDriver } from '../../../../src/lib/sqlite-driver';
import { resolveProposalsDbPaths } from '../../../../src/lib/db-path';

const makeTmpPath = (): { dir: string; path: string } => {
	const dir = mkdtempSync(join(tmpdir(), 'proposals-sqlite-slices-repo-'));
	return {
		dir,
		path: resolveProposalsDbPaths(dir, { stateDir: dir }).databasePath,
	};
};

describe('SliceRepo (r00051 S2)', () => {
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

	it('x00539 S3 — create is idempotent by uid, aligned with plans and proposals', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const proposal = new ProposalRepo(driver.handle).upsertProjection(
				{
					uid: 'f00418',
					slug: 'f00418',
					path: 'ready/feats/f00418.md',
					title: 'Autodeteccion',
					kind: 'feat',
					status: 'ready',
					type: 'proposal',
					track: 'general',
					bodyHash: 'hash',
				},
				100,
			).proposal;
			const plan = new PlanRepo(driver.handle).create({
				uid: 'f00418',
				proposalId: proposal.id,
				slug: 'f00418',
				title: 'Autodeteccion',
				now: 110,
			});

			const repo = new SliceRepo(driver.handle);
			const first = repo.create({
				uid: 'f00418.S1',
				planId: plan.id,
				slug: 'f00418.s1',
				title: 'Slice one',
				sourcePath: 'ready/feats/f00418.md',
				status: 'ready',
				now: 120,
			});
			const second = repo.create({
				uid: 'f00418.S1',
				planId: plan.id,
				slug: 'f00418.s1',
				title: 'Slice one',
				sourcePath: 'review/f00418.md',
				status: 'in-progress',
				now: 130,
			});

			expect(second.id).toBe(first.id);
			expect(second.revision).toBe(1);
			expect(second.status).toBe('in-progress');
			expect(second.sourcePath).toBe('review/f00418.md');
			expect(
				driver.handle
					.query<{ readonly count: number }, []>(
						'SELECT COUNT(*) AS count FROM slices',
					)
					.get()?.count,
			).toBe(1);
		} finally {
			driver.close();
		}
	});

	it('creates and transitions a slice with lifecycle side effects', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const proposal = new ProposalRepo(driver.handle).upsertProjection(
				{
					uid: 'q00022',
					slug: 'q00022',
					path: 'ready/plans/q00022.md',
					title: 'Plan',
					kind: 'plan',
					status: 'ready',
					type: 'proposal',
					track: 'architecture',
					bodyHash: 'hash',
				},
				100,
			).proposal;
			const plan = new PlanRepo(driver.handle).create({
				uid: 'q00022.S1',
				proposalId: proposal.id,
				slug: 'q00022-s1',
				title: 'Plan slice',
				now: 110,
			});

			const repo = new SliceRepo(driver.handle);
			const created = repo.create({
				uid: 'q00022.S1.a',
				planId: plan.id,
				slug: 'q00022-s1-a',
				title: 'Slice',
				now: 120,
			});
			expect(created.status).toBe('ready');

			const transitioned = repo.transitionStatus({
				uid: 'q00022.S1.a',
				toStatus: 'review',
				actor: 'github-copilot',
				source: 'unit-test',
				now: 130,
			});
			expect(transitioned.kind).toBe('transitioned');
			if (transitioned.kind !== 'transitioned') return;
			expect(transitioned.slice.status).toBe('review');

			const lifecycleRows = new LifecycleRepo(
				driver.handle,
			).listForEntity({
				entityType: 'slice',
				entityUid: 'q00022.S1.a',
			});
			expect(lifecycleRows).toHaveLength(1);
			expect(lifecycleRows[0]?.toStatus).toBe('review');
		} finally {
			driver.close();
		}
	});

	it('closes a slice and reports already_closed or conflict explicitly', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const proposal = new ProposalRepo(driver.handle).upsertProjection(
				{
					uid: 'q00022',
					slug: 'q00022',
					path: 'ready/plans/q00022.md',
					title: 'Plan',
					kind: 'plan',
					status: 'ready',
					type: 'proposal',
					track: 'architecture',
					bodyHash: 'hash',
				},
				100,
			).proposal;
			const plan = new PlanRepo(driver.handle).create({
				uid: 'q00022.S1',
				proposalId: proposal.id,
				slug: 'q00022-s1',
				title: 'Plan slice',
				now: 110,
			});
			const repo = new SliceRepo(driver.handle);
			repo.create({
				uid: 'q00022.S1.a',
				planId: plan.id,
				slug: 'q00022-s1-a',
				title: 'Slice',
				now: 120,
			});

			const conflict = repo.closeSlice({
				uid: 'q00022.S1.a',
				actor: 'github-copilot',
				source: 'unit-test',
				expectedRevision: 3,
				now: 130,
			});
			expect(conflict.kind).toBe('conflict');

			const closed = repo.closeSlice({
				uid: 'q00022.S1.a',
				actor: 'github-copilot',
				source: 'unit-test',
				now: 131,
			});
			expect(closed.kind).toBe('closed');
			const replay = repo.closeSlice({
				uid: 'q00022.S1.a',
				actor: 'github-copilot',
				source: 'unit-test',
				now: 132,
			});
			expect(replay.kind).toBe('already_closed');
		} finally {
			driver.close();
		}
	});

	it('stamps closedAt for every terminal status and rejects terminal regressions', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const proposal = new ProposalRepo(driver.handle).upsertProjection(
				{
					uid: 'q00022',
					slug: 'q00022',
					path: 'ready/plans/q00022.md',
					title: 'Plan',
					kind: 'plan',
					status: 'ready',
					type: 'proposal',
					track: 'architecture',
					bodyHash: 'hash',
				},
				100,
			).proposal;
			const plan = new PlanRepo(driver.handle).create({
				uid: 'q00022.S2',
				proposalId: proposal.id,
				slug: 'q00022-s2',
				title: 'Retired plan slice',
				now: 110,
			});

			const repo = new SliceRepo(driver.handle);
			const quarantined = repo.create({
				uid: 'q00022.S2.a',
				planId: plan.id,
				slug: 'q00022-s2-a',
				title: 'Quarantined slice',
				status: 'quarantined',
				now: 140,
			});
			expect(quarantined.closedAt).toBe(140);

			const invalid = repo.transitionStatus({
				uid: 'q00022.S2.a',
				toStatus: 'ready',
				actor: 'github-copilot',
				source: 'unit-test',
				now: 150,
			});
			expect(invalid).toEqual({
				kind: 'invalid_transition',
				reason: 'cannot transition slice q00022.S2.a from quarantined to ready',
			});
		} finally {
			driver.close();
		}
	});
});
