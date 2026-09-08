import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ProposalsSqliteDriver } from '../../../../src/lib/sqlite-driver';
import { MutationCommandsRepo } from '../../../../src/lib/repository/mutation-commands-repo';
import { resolveProposalsDbPaths } from '../../../../src/lib/db-path';

const makeTmpPath = (): { dir: string; path: string } => {
	const dir = mkdtempSync(
		join(tmpdir(), 'proposals-sqlite-mutation-commands-'),
	);
	return {
		dir,
		path: resolveProposalsDbPaths(dir, { stateDir: dir }).databasePath,
	};
};

describe('MutationCommandsRepo (r00050 S1)', () => {
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

	it('starts a new command and replays the same key plus same fingerprint', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const repo = new MutationCommandsRepo(driver.handle);
			const started = repo.claim({
				commandName: 'close_proposal',
				idempotencyKey: 'idem-1',
				requestFingerprint: 'fp-a',
				entityType: 'proposal',
				entityUid: 'x00512',
				revisionBefore: 4,
				now: 100,
			});
			expect(started.kind).toBe('started');
			expect(started.command.status).toBe('started');

			const replayed = repo.claim({
				commandName: 'close_proposal',
				idempotencyKey: 'idem-1',
				requestFingerprint: 'fp-a',
				entityType: 'proposal',
				entityUid: 'x00512',
				revisionBefore: 4,
				now: 101,
			});
			expect(replayed.kind).toBe('replayed');
			expect(replayed.command.id).toBe(started.command.id);
		} finally {
			driver.close();
		}
	});

	it('rejects the same command key with a different fingerprint', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const repo = new MutationCommandsRepo(driver.handle);
			repo.claim({
				commandName: 'close_proposal',
				idempotencyKey: 'idem-1',
				requestFingerprint: 'fp-a',
				entityType: 'proposal',
				entityUid: 'x00512',
				now: 100,
			});

			const conflict = repo.claim({
				commandName: 'close_proposal',
				idempotencyKey: 'idem-1',
				requestFingerprint: 'fp-b',
				entityType: 'proposal',
				entityUid: 'x00512',
				now: 101,
			});
			expect(conflict.kind).toBe('conflict');
			expect(conflict.command.requestFingerprint).toBe('fp-a');
		} finally {
			driver.close();
		}
	});

	it('completes a started command with outcome and response snapshot', () => {
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const repo = new MutationCommandsRepo(driver.handle);
			const started = repo.claim({
				commandName: 'close_proposal',
				idempotencyKey: 'idem-1',
				requestFingerprint: 'fp-a',
				entityType: 'proposal',
				entityUid: 'x00512',
				revisionBefore: 4,
				now: 100,
			});

			const completed = repo.complete({
				id: started.command.id,
				revisionAfter: 5,
				outcomeKind: 'closed',
				responseJson: '{"kind":"closed"}',
				now: 200,
			});

			expect(completed.status).toBe('completed');
			expect(completed.revisionAfter).toBe(5);
			expect(completed.outcomeKind).toBe('closed');
			expect(completed.responseJson).toBe('{"kind":"closed"}');
			expect(completed.completedAt).toBe(200);
		} finally {
			driver.close();
		}
	});
});
