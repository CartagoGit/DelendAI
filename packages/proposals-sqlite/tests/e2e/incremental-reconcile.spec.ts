/**
 * incremental-reconcile.spec.ts — r00055 S1's gate, end to end on a real
 * database.
 *
 * The unit specs cover each piece; what this file exists to prove is the
 * sequence a running workspace actually performs, because the three holes
 * r00055 names only appear in sequence:
 *
 *   1. an incremental pass WRITES to the active database (before r00055 it
 *      produced candidates and dropped them, which is why the soak clock
 *      r00049 requires could not start),
 *   2. running the same pass again changes nothing — no second row, no
 *      duplicated lifecycle or outbox entry,
 *   3. a promotion built from a snapshot older than the active database is
 *      refused instead of silently replacing newer authority,
 *   4. an entity that stops appearing in the source is classified rather
 *      than left alive,
 *
 * and after all of it the database is still structurally sound.
 */
import { mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	applyValidatedCandidate,
	ProposalsSqliteDriver,
	reconcileIncremental,
	reconcileShadowToStaging,
	resolveProposalsDbPaths,
} from '../../src';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const makeRoot = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'r00055-incremental-e2e-'));
	roots.push(root);
	return root;
};

const file = (uid: string, status: string, sha: string) => ({
	path: `docs/delendai/proposals/ready/fixes/${uid}.md`,
	sha,
	raw: `---\nid: ${uid}\ntitle: Fixture ${uid}\nkind: fix\nstatus: ${status}\ntype: proposal\ntrack: architecture\n---\n# Fixture ${uid}\n`,
});

/** Builds an active database from scratch, the way a full rebuild does. */
const seedActive = (
	root: string,
	sourceCommit: string,
	files: readonly ReturnType<typeof file>[],
): string => {
	const paths = resolveProposalsDbPaths(root);
	const staged = reconcileShadowToStaging({
		mode: 'shadow',
		workspacePath: root,
		statePath: paths.stateDir,
		sourceCommit,
		sha: `tree-${sourceCommit}`,
		files,
		now: 1_700_000_000_000,
	});
	renameSync(staged.stagingPath, paths.databasePath);
	return paths.databasePath;
};

/** Reads a column out of the active database without going through a repo. */
const query = <T>(databasePath: string, sql: string): T[] => {
	const driver = new ProposalsSqliteDriver({ path: databasePath });
	try {
		return driver.handle.prepare(sql).all() as T[];
	} finally {
		driver.close();
	}
};

const count = (databasePath: string, table: string): number =>
	query<{ n: number }>(databasePath, `SELECT COUNT(*) AS n FROM ${table}`)[0]
		?.n ?? 0;

describe('an incremental pass over the files a change touched', () => {
	it('writes the change into the active database', () => {
		const root = makeRoot();
		const databasePath = seedActive(root, 'commit-a', [
			file('x00001', 'ready', 'blob-1'),
			file('x00002', 'ready', 'blob-2'),
		]);

		const result = reconcileIncremental({
			databasePath,
			sourceCommit: 'commit-b',
			// ONLY what moved: one proposal changed status, one is new.
			files: [
				file('x00002', 'in-progress', 'blob-2b'),
				file('x00003', 'ready', 'blob-3'),
			],
			now: 1_700_000_100_000,
		});

		expect(result.status).toBe('ok');
		expect(result.proposalsCreated).toBe(1);
		expect(result.proposalsUpdated).toBe(1);

		const rows = query<{ uid: string; status: string }>(
			databasePath,
			'SELECT uid, status FROM proposals ORDER BY uid',
		);
		expect(rows).toEqual([
			{ uid: 'x00001', status: 'ready' },
			{ uid: 'x00002', status: 'in-progress' },
			{ uid: 'x00003', status: 'ready' },
		]);
	});

	it('changes nothing the second time it is asked', () => {
		const root = makeRoot();
		const databasePath = seedActive(root, 'commit-a', [
			file('x00001', 'ready', 'blob-1'),
		]);
		const changed = [file('x00001', 'in-progress', 'blob-1b')];

		reconcileIncremental({
			databasePath,
			sourceCommit: 'commit-b',
			files: changed,
			now: 1_700_000_100_000,
		});
		const lifecycleAfterFirst = count(databasePath, 'lifecycle_events');
		const outboxAfterFirst = count(databasePath, 'outbox');

		const second = reconcileIncremental({
			databasePath,
			sourceCommit: 'commit-b',
			files: changed,
			now: 1_700_000_200_000,
		});

		// `unchanged` is reported separately from `updated` precisely so a
		// replay can prove it was a replay.
		expect(second.proposalsCreated).toBe(0);
		expect(second.proposalsUpdated).toBe(0);
		expect(second.proposalsUnchanged).toBe(1);
		expect(count(databasePath, 'lifecycle_events')).toBe(
			lifecycleAfterFirst,
		);
		expect(count(databasePath, 'outbox')).toBe(outboxAfterFirst);
		expect(
			query<{ uid: string; status: string }>(
				databasePath,
				'SELECT uid, status FROM proposals',
			),
		).toEqual([{ uid: 'x00001', status: 'in-progress' }]);
	});

	it('leaves the database structurally sound', () => {
		const root = makeRoot();
		const databasePath = seedActive(root, 'commit-a', [
			file('x00001', 'ready', 'blob-1'),
		]);
		reconcileIncremental({
			databasePath,
			sourceCommit: 'commit-b',
			files: [file('x00002', 'ready', 'blob-2')],
			now: 1_700_000_100_000,
		});

		expect(
			query<{ integrity_check: string }>(
				databasePath,
				'PRAGMA integrity_check',
			),
		).toEqual([{ integrity_check: 'ok' }]);
		expect(query(databasePath, 'PRAGMA foreign_key_check')).toEqual([]);
	});
});

describe('promoting a staging database built from an older snapshot', () => {
	it('is refused, and the rows it would have replaced stay put', () => {
		const root = makeRoot();
		const paths = resolveProposalsDbPaths(root);
		seedActive(root, 'commit-a', [file('x00001', 'ready', 'blob-1')]);

		// A staging copy built while active was still at commit-a.
		const staged = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath: root,
			statePath: paths.stateDir,
			sourceCommit: 'commit-stale',
			sha: 'tree-stale',
			files: [file('x00001', 'blocked', 'blob-1-stale')],
			now: 1_700_000_050_000,
		});

		// Meanwhile somebody else moves the active database forward.
		reconcileIncremental({
			databasePath: paths.databasePath,
			sourceCommit: 'commit-newer',
			files: [file('x00001', 'in-progress', 'blob-1b')],
			now: 1_700_000_100_000,
		});

		const result = applyValidatedCandidate({
			stagingPath: staged.stagingPath,
			activePath: paths.databasePath,
			sourceCommit: 'commit-stale',
			// What the caller believed the active authority was when it
			// started building: that belief is now false.
			expectedActiveSourceCommit: 'commit-a',
			now: 1_700_000_200_000,
		});

		expect(result.status).toBe('rejected');
		expect(result.reason).toMatch(/active database has moved/i);
		expect(result.proposalsApplied).toBe(0);
		// The newer state is what a reader still sees — a rejected
		// promotion that had already written half its rows would be worse
		// than the lost update it exists to prevent.
		expect(
			query<{ uid: string; status: string }>(
				paths.databasePath,
				'SELECT uid, status FROM proposals',
			),
		).toEqual([{ uid: 'x00001', status: 'in-progress' }]);
	});
});

describe('an entity that stops appearing in the source', () => {
	it('is classified, not left alive and indistinguishable from a real one', () => {
		const root = makeRoot();
		const paths = resolveProposalsDbPaths(root);
		seedActive(root, 'commit-a', [
			file('x00001', 'ready', 'blob-1'),
			file('x00002', 'ready', 'blob-2'),
		]);

		// The next snapshot of the repository no longer carries x00002:
		// deleted, renamed, or moved out of the proposals tree.
		const staged = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath: root,
			statePath: paths.stateDir,
			sourceCommit: 'commit-b',
			sha: 'tree-b',
			files: [file('x00001', 'ready', 'blob-1')],
			now: 1_700_000_100_000,
		});

		const result = applyValidatedCandidate({
			stagingPath: staged.stagingPath,
			activePath: paths.databasePath,
			sourceCommit: 'commit-b',
			expectedActiveSourceCommit: 'commit-a',
			now: 1_700_000_200_000,
		});

		expect([result.status, result.reason]).toEqual(['ok', null]);
		expect(result.tombstonesApplied).toBe(1);

		// The row survives — a physical DELETE would take the uid, and
		// with it every reference other tables hold — but it can no
		// longer be mistaken for a live proposal.
		const rows = query<{
			uid: string;
			deleted_at: number | null;
			tombstone_reason: string | null;
		}>(
			paths.databasePath,
			'SELECT uid, deleted_at, tombstone_reason FROM proposals ORDER BY uid',
		);
		expect(rows.map((row) => row.uid)).toEqual(['x00001', 'x00002']);
		expect(rows[0]?.deleted_at).toBeNull();
		expect(rows[1]?.deleted_at).not.toBeNull();
		expect(rows[1]?.tombstone_reason).not.toBeNull();
		expect(count(paths.databasePath, 'tombstones')).toBe(1);
	});
});
