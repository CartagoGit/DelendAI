import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IProposalCandidate } from '../../../../src/lib/reconciler';
import { LifecycleRepo } from '../../../../src/lib/repository/lifecycle-repo';
import { OutboxRepo } from '../../../../src/lib/repository/outbox-repo';
import { ProposalRepo } from '../../../../src/lib/repository/proposals-repo';
import { ProposalsSqliteDriver } from '../../../../src/lib/sqlite-driver';

const makeTmpPath = (): { dir: string; path: string } => {
	const dir = mkdtempSync(join(tmpdir(), 'proposals-sqlite-proposals-repo-'));
	return { dir, path: join(dir, 'proposals.sqlite') };
};

const candidate = (
	overrides: Partial<IProposalCandidate> = {},
): IProposalCandidate => ({
	uid: 'x00512',
	slug: 'x00512',
	path: 'ready/fixes/x00512.md',
	title: 'Capability resolver',
	kind: 'fix',
	status: 'ready',
	type: 'proposal',
	track: 'architecture',
	bodyHash: 'hash-1',
	...overrides,
});

describe('ProposalRepo (q00022 S3)', () => {
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

	it('creates, reuses, and updates proposal projection rows', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const repo = new ProposalRepo(driver.handle);
			const created = repo.upsertProjection(candidate(), 100);
			expect(created.kind).toBe('created');
			expect(created.proposal.revision).toBe(0);

			const unchanged = repo.upsertProjection(candidate(), 101);
			expect(unchanged.kind).toBe('unchanged');
			expect(unchanged.proposal.revision).toBe(0);

			const updated = repo.upsertProjection(
				candidate({ title: 'Capability resolver v2', bodyHash: 'hash-2' }),
				102,
			);
			expect(updated.kind).toBe('updated');
			expect(updated.proposal.revision).toBe(1);
			expect(updated.proposal.title).toBe('Capability resolver v2');
		} finally {
			driver.close();
		}
	});

	it('closes a proposal atomically with lifecycle and outbox side ledgers', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const repo = new ProposalRepo(driver.handle);
			repo.upsertProjection(candidate(), 100);

			const closed = repo.closeProposal({
				uid: 'x00512',
				actor: 'github-copilot',
				source: 'unit-test',
				now: 200,
			});

			expect(closed.kind).toBe('closed');
			if (closed.kind !== 'closed') return;
			expect(closed.proposal.status).toBe('done');
			expect(closed.proposal.revision).toBe(1);
			expect(closed.outbox.status).toBe('pending');

			const lifecycleRows = new LifecycleRepo(driver.handle).listForEntity({
				entityType: 'proposal',
				entityUid: 'x00512',
			});
			expect(lifecycleRows).toHaveLength(1);
			expect(lifecycleRows[0]?.fromStatus).toBe('ready');
			expect(lifecycleRows[0]?.toStatus).toBe('done');

			const pending = new OutboxRepo(driver.handle).listPending(200);
			expect(pending).toHaveLength(1);
			expect(pending[0]?.kind).toBe('proposal-closed');
		} finally {
			driver.close();
		}
	});

	it('returns already_closed and conflict outcomes without corrupting the row', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const repo = new ProposalRepo(driver.handle);
			repo.upsertProjection(candidate(), 100);
			const conflict = repo.closeProposal({
				uid: 'x00512',
				actor: 'github-copilot',
				source: 'unit-test',
				expectedRevision: 4,
				now: 200,
			});
			expect(conflict.kind).toBe('conflict');
			if (conflict.kind !== 'conflict') return;
			expect(conflict.currentRevision).toBe(0);

			repo.closeProposal({
				uid: 'x00512',
				actor: 'github-copilot',
				source: 'unit-test',
				now: 201,
			});
			const replay = repo.closeProposal({
				uid: 'x00512',
				actor: 'github-copilot',
				source: 'unit-test',
				now: 202,
			});
			expect(replay.kind).toBe('already_closed');
		} finally {
			driver.close();
		}
	});
});