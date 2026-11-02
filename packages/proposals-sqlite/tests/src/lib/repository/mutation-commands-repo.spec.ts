import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

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

	it('claims the key in ONE statement, so there is no window to lose', async () => {
		// A mechanism test, and deliberately so.
		//
		// The implementation this replaced read the row, saw none, and
		// then inserted. Between those two steps another connection can
		// insert the same key, and the loser got a UNIQUE constraint
		// exception out of the middle of a lifecycle verb instead of a
		// verdict — with both callers believing they had started the
		// command, which is the double effect receipts exist to prevent.
		//
		// Two processes racing on one file were tried first and did NOT
		// catch the old implementation: three runs, all green. Process
		// startup dwarfs the window, so they never actually overlapped at
		// the instant that matters. A behavioural test that cannot fail
		// against the bug is not evidence, so the claim is pinned where
		// it is decided — in the SQL.
		const source = await Bun.file(
			resolve(
				import.meta.dir,
				'../../../../src/lib/repository/mutation-commands-repo.ts',
			),
		).text();
		const claimBody = source.slice(
			source.indexOf('claim(args: IClaimMutationCommandArgs)'),
			source.indexOf('complete(args: ICompleteMutationCommandArgs)'),
		);

		// The insert absorbs the conflict itself and reports whether it
		// happened. Without RETURNING there is nothing to distinguish
		// "I inserted it" from "somebody already had it".
		expect(claimBody).toContain('ON CONFLICT');
		expect(claimBody).toContain('DO NOTHING');
		expect(claimBody).toContain('RETURNING');

		// And no SELECT may run BEFORE that insert: a read that decides
		// whether to write is the window this exists to close.
		const insertAt = claimBody.indexOf('INSERT INTO mutation_commands');
		const readAt = claimBody.indexOf('readByCommandKey');
		expect(insertAt).toBeGreaterThan(-1);
		expect(readAt).toBeGreaterThan(insertAt);
	});

	it('answers replay and conflict for a key that already exists', () => {
		// The verdicts themselves, which both implementations satisfy —
		// kept because the SQL rewrite must not change what a caller is
		// told, only when it can be told it.
		const first = new ProposalsSqliteDriver({ path: dbPath });
		const second = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const base = {
				commandName: 'close_proposal',
				idempotencyKey: 'shared-key',
				entityType: 'proposal' as const,
				entityUid: 'x00700',
				revisionBefore: 1,
			};
			const started = new MutationCommandsRepo(first.handle).claim({
				...base,
				requestFingerprint: 'fp-same',
			});
			// A SECOND connection, so the verdict does not come from
			// in-process state.
			const replayed = new MutationCommandsRepo(second.handle).claim({
				...base,
				requestFingerprint: 'fp-same',
			});

			expect(started.kind).toBe('started');
			expect(replayed.kind).toBe('replayed');
			expect(replayed.command.id).toBe(started.command.id);
		} finally {
			first.close();
			second.close();
		}
	});

	it('tells the loser it is a conflict when the request differs', () => {
		// Same key, different fingerprint: not a replay. Returning the
		// stored outcome here would answer a question nobody asked.
		const first = new ProposalsSqliteDriver({ path: dbPath });
		const second = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const base = {
				commandName: 'close_proposal',
				idempotencyKey: 'race-2',
				entityType: 'proposal' as const,
				entityUid: 'x00601',
			};
			const started = new MutationCommandsRepo(first.handle).claim({
				...base,
				requestFingerprint: 'fp-a',
			});
			const other = new MutationCommandsRepo(second.handle).claim({
				...base,
				requestFingerprint: 'fp-b',
			});

			expect(started.kind).toBe('started');
			expect(other.kind).toBe('conflict');
			expect(other.command.requestFingerprint).toBe('fp-a');
		} finally {
			first.close();
			second.close();
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
