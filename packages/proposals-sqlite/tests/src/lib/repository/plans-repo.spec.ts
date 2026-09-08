import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LifecycleRepo } from '../../../../src/lib/repository/lifecycle-repo';
import { OutboxRepo } from '../../../../src/lib/repository/outbox-repo';
import { PlanRepo } from '../../../../src/lib/repository/plans-repo';
import { ProposalRepo } from '../../../../src/lib/repository/proposals-repo';
import { ProposalsSqliteDriver } from '../../../../src/lib/sqlite-driver';

const makeTmpPath = (): { dir: string; path: string } => {
	const dir = mkdtempSync(join(tmpdir(), 'proposals-sqlite-plans-repo-'));
	return { dir, path: join(dir, 'proposals.sqlite') };
};

describe('PlanRepo (r00051 S2)', () => {
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

	it('creates and transitions a plan with lifecycle and outbox side effects', () => {
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
				100
			).proposal;

			const repo = new PlanRepo(driver.handle);
			const created = repo.create({
				uid: 'q00022.S1',
				proposalId: proposal.id,
				slug: 'q00022-s1',
				title: 'Plan slice',
				now: 110,
			});
			expect(created.status).toBe('ready');

			const transitioned = repo.transitionStatus({
				uid: 'q00022.S1',
				toStatus: 'review',
				actor: 'github-copilot',
				source: 'unit-test',
				now: 120,
			});
			expect(transitioned.kind).toBe('transitioned');
			if (transitioned.kind !== 'transitioned') return;
			expect(transitioned.plan.status).toBe('review');
			expect(transitioned.plan.revision).toBe(1);

			const lifecycleRows = new LifecycleRepo(
				driver.handle
			).listForEntity({
				entityType: 'plan',
				entityUid: 'q00022.S1',
			});
			expect(lifecycleRows).toHaveLength(1);
			expect(lifecycleRows[0]?.toStatus).toBe('review');

			// Scoped to this repo's own rows on purpose. The fixture creates a
			// proposal first, and `ProposalRepo` enqueues its own outbox row on
			// write, so a global `toHaveLength(1)` asserted something this test
			// is not about and broke the moment proposal writes grew a side
			// effect of their own.
			const pending = new OutboxRepo(driver.handle)
				.listPending(120)
				.filter((row) => row.kind === 'plan-transitioned');
			expect(pending).toHaveLength(1);
		} finally {
			driver.close();
		}
	});

	it('closes a plan and reports already_closed or conflict explicitly', () => {
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
				100
			).proposal;
			const repo = new PlanRepo(driver.handle);
			repo.create({
				uid: 'q00022.S1',
				proposalId: proposal.id,
				slug: 'q00022-s1',
				title: 'Plan slice',
				now: 110,
			});

			const conflict = repo.closePlan({
				uid: 'q00022.S1',
				actor: 'github-copilot',
				source: 'unit-test',
				expectedRevision: 3,
				now: 120,
			});
			expect(conflict.kind).toBe('conflict');

			const closed = repo.closePlan({
				uid: 'q00022.S1',
				actor: 'github-copilot',
				source: 'unit-test',
				now: 121,
			});
			expect(closed.kind).toBe('closed');
			const replay = repo.closePlan({
				uid: 'q00022.S1',
				actor: 'github-copilot',
				source: 'unit-test',
				now: 122,
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
				100
			).proposal;

			const repo = new PlanRepo(driver.handle);
			const retired = repo.create({
				uid: 'q00022.S2',
				proposalId: proposal.id,
				slug: 'q00022-s2',
				title: 'Retired plan slice',
				status: 'retired',
				now: 140,
			});
			expect(retired.closedAt).toBe(140);

			const invalid = repo.transitionStatus({
				uid: 'q00022.S2',
				toStatus: 'ready',
				actor: 'github-copilot',
				source: 'unit-test',
				now: 150,
			});
			expect(invalid).toEqual({
				kind: 'invalid_transition',
				reason: 'cannot transition plan q00022.S2 from retired to ready',
			});
		} finally {
			driver.close();
		}
	});
});
