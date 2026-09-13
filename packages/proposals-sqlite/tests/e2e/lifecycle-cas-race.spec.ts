/**
 * The compare-and-swap property, proven against the code that runs.
 *
 * `revision-cas.spec.ts` proves `casUpdate` — a correct helper that,
 * measured on this tree, NO repository calls. The three lifecycle verbs
 * implement their own compare inside a `BEGIN IMMEDIATE` transaction, so
 * the property r00048 asks for ("uniform compare-and-swap on
 * proposals/plans/slices, proven by a multi-connection race") had been
 * demonstrated on a path the product does not take, for one of the
 * three tables.
 *
 * These cases take the real verbs. SEPARATE connections, because two
 * calls on one handle are serialised by that handle and would prove
 * nothing: the second caller here holds a genuinely stale view of the
 * revision, which is exactly the situation a swarm produces.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	PlanRepo,
	ProposalRepo,
	ProposalsSqliteDriver,
	SliceRepo,
	resolveProposalsDbPaths,
} from '../../src';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const database = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'lifecycle-cas-race-'));
	roots.push(root);
	return resolveProposalsDbPaths(root, { stateDir: root }).databasePath;
};

describe('lifecycle compare-and-swap across connections', () => {
	it('lets one connection close a proposal and refuses the stale one', () => {
		const path = database();
		const seeder = new ProposalsSqliteDriver({ path });
		try {
			new ProposalRepo(seeder.handle).upsertProjection(
				{
					uid: 'cas-p',
					slug: 'cas-p',
					path: 'ready/feats/cas-p.md',
					title: 'CAS subject',
					kind: 'feat',
					status: 'ready',
					type: 'proposal',
					track: 'general',
					bodyHash: 'cas',
				},
				100,
			);
		} finally {
			seeder.close();
		}

		const first = new ProposalsSqliteDriver({ path });
		const second = new ProposalsSqliteDriver({ path });
		try {
			// Both read revision 0 before either writes — the stale view
			// the race is about.
			const expectedRevision = new ProposalRepo(first.handle).getByUid(
				'cas-p',
			)?.revision;
			expect(expectedRevision).toBe(0);

			const winner = new ProposalRepo(first.handle).closeProposal({
				uid: 'cas-p',
				actor: 'a',
				source: 'race',
				expectedRevision,
				now: 200,
			});
			const loser = new ProposalRepo(second.handle).closeProposal({
				uid: 'cas-p',
				actor: 'b',
				source: 'race',
				expectedRevision,
				now: 201,
			});

			expect(winner.kind).toBe('closed');
			expect(loser.kind).toBe('conflict');
			// One row, not two: a lost race must leave nothing behind.
			expect(
				second.handle
					.query<{ count: number }, []>(
						"SELECT COUNT(*) AS count FROM lifecycle_events WHERE entity_type = 'proposal' AND entity_uid = 'cas-p'",
					)
					.get()?.count,
			).toBe(1);
		} finally {
			first.close();
			second.close();
		}
	});

	it('does the same for a plan', () => {
		const path = database();
		const seeder = new ProposalsSqliteDriver({ path });
		try {
			const proposal = new ProposalRepo(seeder.handle).upsertProjection(
				{
					uid: 'cas-pl',
					slug: 'cas-pl',
					path: 'ready/feats/cas-pl.md',
					title: 'Plan CAS',
					kind: 'feat',
					status: 'ready',
					type: 'proposal',
					track: 'general',
					bodyHash: 'cas',
				},
				100,
			).proposal;
			new PlanRepo(seeder.handle).create({
				uid: 'cas-pl',
				proposalId: proposal.id,
				slug: 'cas-pl',
				title: 'Plan CAS',
				status: 'ready',
				now: 110,
			});
		} finally {
			seeder.close();
		}

		const first = new ProposalsSqliteDriver({ path });
		const second = new ProposalsSqliteDriver({ path });
		try {
			const expectedRevision = new PlanRepo(first.handle).getByUid(
				'cas-pl',
			)?.revision;
			const winner = new PlanRepo(first.handle).closePlan({
				uid: 'cas-pl',
				actor: 'a',
				source: 'race',
				expectedRevision,
				now: 200,
			});
			const loser = new PlanRepo(second.handle).closePlan({
				uid: 'cas-pl',
				actor: 'b',
				source: 'race',
				expectedRevision,
				now: 201,
			});
			expect(winner.kind).toBe('closed');
			expect(loser.kind).toBe('conflict');
		} finally {
			first.close();
			second.close();
		}
	});

	it('does the same for a slice', () => {
		const path = database();
		const seeder = new ProposalsSqliteDriver({ path });
		try {
			const proposal = new ProposalRepo(seeder.handle).upsertProjection(
				{
					uid: 'cas-sl',
					slug: 'cas-sl',
					path: 'ready/feats/cas-sl.md',
					title: 'Slice CAS',
					kind: 'feat',
					status: 'ready',
					type: 'proposal',
					track: 'general',
					bodyHash: 'cas',
				},
				100,
			).proposal;
			const plan = new PlanRepo(seeder.handle).create({
				uid: 'cas-sl',
				proposalId: proposal.id,
				slug: 'cas-sl',
				title: 'Slice CAS',
				status: 'ready',
				now: 110,
			});
			new SliceRepo(seeder.handle).create({
				uid: 'cas-sl-s1',
				planId: plan.id,
				slug: 's1',
				title: 'S1',
				status: 'ready',
				now: 120,
			});
		} finally {
			seeder.close();
		}

		const first = new ProposalsSqliteDriver({ path });
		const second = new ProposalsSqliteDriver({ path });
		try {
			const expectedRevision = new SliceRepo(first.handle).getByUid(
				'cas-sl-s1',
			)?.revision;
			const winner = new SliceRepo(first.handle).closeSlice({
				uid: 'cas-sl-s1',
				actor: 'a',
				source: 'race',
				expectedRevision,
				now: 200,
			});
			const loser = new SliceRepo(second.handle).closeSlice({
				uid: 'cas-sl-s1',
				actor: 'b',
				source: 'race',
				expectedRevision,
				now: 201,
			});
			expect(winner.kind).toBe('closed');
			expect(loser.kind).toBe('conflict');
		} finally {
			first.close();
			second.close();
		}
	});
});
