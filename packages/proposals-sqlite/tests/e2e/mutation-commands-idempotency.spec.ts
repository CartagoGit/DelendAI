import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	ProposalRepo,
	ProposalsSqliteDriver,
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
});
