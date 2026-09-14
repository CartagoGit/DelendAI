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

describe('mutation command recovery', () => {
	it('replays the stored outcome after restart and rejects a changed fingerprint', () => {
		const root = mkdtempSync(join(tmpdir(), 'mutation-command-recovery-'));
		roots.push(root);
		const databasePath = resolveProposalsDbPaths(root, {
			stateDir: root,
		}).databasePath;

		const firstDriver = new ProposalsSqliteDriver({ path: databasePath });
		let closed: ReturnType<ProposalRepo['closeProposal']>;
		try {
			const repo = new ProposalRepo(firstDriver.handle);
			repo.upsertProjection(
				{
					uid: 'r00050',
					slug: 'r00050',
					path: 'ready/refactors/r00050.md',
					title: 'Mutation command recovery',
					kind: 'refactor',
					status: 'ready',
					type: 'proposal',
					track: 'architecture',
					bodyHash: 'recovery-content',
				},
				100,
			);
			closed = repo.closeProposal({
				uid: 'r00050',
				actor: 'first-process',
				source: 'e2e',
				idempotencyKey: 'recover-close-r00050',
				now: 200,
			});
			expect(closed.kind).toBe('closed');
		} finally {
			firstDriver.close();
		}

		const restartedDriver = new ProposalsSqliteDriver({
			path: databasePath,
		});
		try {
			const restartedRepo = new ProposalRepo(restartedDriver.handle);
			expect(
				restartedRepo.closeProposal({
					uid: 'r00050',
					actor: 'restarted-process',
					source: 'retry',
					idempotencyKey: 'recover-close-r00050',
					now: 300,
				}),
			).toEqual(closed);
			expect(
				restartedRepo.closeProposal({
					uid: 'r00050',
					actor: 'restarted-process',
					source: 'retry',
					idempotencyKey: 'recover-close-r00050',
					requestFingerprint: 'changed-request',
					now: 301,
				}).kind,
			).toBe('idempotency_conflict');
			expect(
				restartedDriver.handle
					.query<{ count: number }, []>(
						"SELECT COUNT(*) AS count FROM lifecycle_events WHERE entity_type = 'proposal' AND entity_uid = 'r00050'",
					)
					.get()?.count,
			).toBe(1);
		} finally {
			restartedDriver.close();
		}
	});

	/**
	 * The same three guarantees, for the other two lifecycle verbs.
	 *
	 * r00050's property is written in the plural — "integrated into the
	 * real lifecycle verbs" — and until now only `closeProposal` was
	 * covered end to end. Three repositories share one receipt
	 * implementation, which is exactly why it is worth proving on more
	 * than one of them: a shared helper that is only ever exercised
	 * through a single caller is a helper whose other callers are
	 * assumed to work.
	 */
	it('replays and conflicts the same way when a plan is the subject', () => {
		const root = mkdtempSync(join(tmpdir(), 'mutation-command-plan-'));
		roots.push(root);
		const databasePath = resolveProposalsDbPaths(root, {
			stateDir: root,
		}).databasePath;

		const first = new ProposalsSqliteDriver({ path: databasePath });
		let closed: ReturnType<PlanRepo['closePlan']>;
		try {
			const proposal = new ProposalRepo(first.handle).upsertProjection(
				{
					uid: 'p1',
					slug: 'p1',
					path: 'ready/feats/p1.md',
					title: 'Plan subject',
					kind: 'feat',
					status: 'ready',
					type: 'proposal',
					track: 'general',
					bodyHash: 'plan-content',
				},
				100,
			).proposal;
			const plans = new PlanRepo(first.handle);
			plans.create({
				uid: 'p1',
				proposalId: proposal.id,
				slug: 'p1',
				title: 'Plan subject',
				status: 'ready',
				now: 110,
			});
			closed = plans.closePlan({
				uid: 'p1',
				actor: 'first-process',
				source: 'e2e',
				idempotencyKey: 'recover-close-p1',
				now: 200,
			});
			expect(closed.kind).toBe('closed');
		} finally {
			first.close();
		}

		const restarted = new ProposalsSqliteDriver({ path: databasePath });
		try {
			const plans = new PlanRepo(restarted.handle);
			expect(
				plans.closePlan({
					uid: 'p1',
					actor: 'restarted-process',
					source: 'retry',
					idempotencyKey: 'recover-close-p1',
					now: 300,
				}),
			).toEqual(closed);
			expect(
				plans.closePlan({
					uid: 'p1',
					actor: 'restarted-process',
					source: 'retry',
					idempotencyKey: 'recover-close-p1',
					requestFingerprint: 'changed-request',
					now: 301,
				}).kind,
			).toBe('idempotency_conflict');
			// The replay must not have written a second event: that count
			// is the whole point of a receipt.
			expect(
				restarted.handle
					.query<{ count: number }, []>(
						"SELECT COUNT(*) AS count FROM lifecycle_events WHERE entity_type = 'plan' AND entity_uid = 'p1'",
					)
					.get()?.count,
			).toBe(1);
		} finally {
			restarted.close();
		}
	});

	it('replays and conflicts the same way when a slice is the subject', () => {
		const root = mkdtempSync(join(tmpdir(), 'mutation-command-slice-'));
		roots.push(root);
		const databasePath = resolveProposalsDbPaths(root, {
			stateDir: root,
		}).databasePath;

		const first = new ProposalsSqliteDriver({ path: databasePath });
		let closed: ReturnType<SliceRepo['closeSlice']>;
		try {
			const proposal = new ProposalRepo(first.handle).upsertProjection(
				{
					uid: 'p2',
					slug: 'p2',
					path: 'ready/feats/p2.md',
					title: 'Slice subject',
					kind: 'feat',
					status: 'ready',
					type: 'proposal',
					track: 'general',
					bodyHash: 'slice-content',
				},
				100,
			).proposal;
			const plan = new PlanRepo(first.handle).create({
				uid: 'p2',
				proposalId: proposal.id,
				slug: 'p2',
				title: 'Slice subject',
				status: 'ready',
				now: 110,
			});
			const slices = new SliceRepo(first.handle);
			slices.create({
				uid: 'p2-s1',
				planId: plan.id,
				slug: 's1',
				title: 'S1',
				status: 'ready',
				now: 120,
			});
			closed = slices.closeSlice({
				uid: 'p2-s1',
				actor: 'first-process',
				source: 'e2e',
				idempotencyKey: 'recover-close-p2-s1',
				now: 200,
			});
			expect(closed.kind).toBe('closed');
		} finally {
			first.close();
		}

		const restarted = new ProposalsSqliteDriver({ path: databasePath });
		try {
			const slices = new SliceRepo(restarted.handle);
			expect(
				slices.closeSlice({
					uid: 'p2-s1',
					actor: 'restarted-process',
					source: 'retry',
					idempotencyKey: 'recover-close-p2-s1',
					now: 300,
				}),
			).toEqual(closed);
			expect(
				slices.closeSlice({
					uid: 'p2-s1',
					actor: 'restarted-process',
					source: 'retry',
					idempotencyKey: 'recover-close-p2-s1',
					requestFingerprint: 'changed-request',
					now: 301,
				}).kind,
			).toBe('idempotency_conflict');
			expect(
				restarted.handle
					.query<{ count: number }, []>(
						"SELECT COUNT(*) AS count FROM lifecycle_events WHERE entity_type = 'slice' AND entity_uid = 'p2-s1'",
					)
					.get()?.count,
			).toBe(1);
		} finally {
			restarted.close();
		}
	});
});
