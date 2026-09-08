import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ProposalsSqliteDriver, resolveProposalsDbPaths } from '../../src';

const roots: string[] = [];

const makeRoot = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'proposals-fts-e2e-'));
	roots.push(root);
	return root;
};

const insertProposal = (
	driver: ProposalsSqliteDriver,
	index: number,
): string => {
	const uid = `x${String(index).padStart(5, '0')}`;
	const now = Date.now();
	driver.handle
		.prepare(
			`INSERT INTO proposals (
				uid, slug, kind, status, title, revision,
				created_at, updated_at
			) VALUES (?, ?, 'feat', 'ready', ?, 0, ?, ?)`,
		)
		.run(uid, uid, `FTS proposal ${index} searchable`, now, now);
	return uid;
};

const rebuildProposalsFts = (driver: ProposalsSqliteDriver): void => {
	driver.handle.exec(`
		DELETE FROM proposals_fts;
		INSERT INTO proposals_fts (uid, title, body)
		SELECT uid, title, '' FROM proposals;
	`);
};

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('proposals FTS5 e2e regression (f00516 S3)', () => {
	it('indexes every inserted proposal and removes deleted rows', () => {
		const root = makeRoot();
		const dbPath = resolveProposalsDbPaths(root).databasePath;
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const inserted = Array.from({ length: 1000 }, (_, index) =>
				insertProposal(driver, index + 1),
			);
			const firstUid = inserted[0];
			if (firstUid === undefined) throw new Error('fixture is empty');
			const hits = driver.handle
				.query<{ uid: string }, [string]>(
					`SELECT uid FROM proposals_fts
					 WHERE proposals_fts MATCH ?`,
				)
				.all('searchable');
			expect(new Set(hits.map((hit) => hit.uid))).toEqual(new Set(inserted));

			driver.handle
				.prepare('DELETE FROM proposals WHERE uid = ?')
				.run(firstUid);
			const orphan = driver.handle
				.query<{ uid: string }, [string]>(
					'SELECT uid FROM proposals_fts WHERE uid = ?',
				)
				.get(firstUid);
			expect(orphan).toBeNull();
		} finally {
			driver.close();
		}
	});

	it('restores the index after manual corruption and rebuild', () => {
		const root = makeRoot();
		const dbPath = resolveProposalsDbPaths(root).databasePath;
		const driver = new ProposalsSqliteDriver({ path: dbPath });
		try {
			const inserted = Array.from({ length: 10 }, (_, index) =>
				insertProposal(driver, index + 1),
			);
			const firstUid = inserted[0];
			if (firstUid === undefined) throw new Error('fixture is empty');
			driver.handle
				.prepare('DELETE FROM proposals_fts WHERE uid = ?')
				.run(firstUid);
			driver.handle
				.prepare(
					'INSERT INTO proposals_fts (uid, title, body) VALUES (?, ?, ?)',
				)
				.run('orphan', 'corrupt row', '');

			const corruptedCount = driver.handle
				.query<{ count: number }, []>(
					'SELECT COUNT(*) AS count FROM proposals_fts',
				)
				.get()?.count;
			expect(corruptedCount).toBe(inserted.length);

			rebuildProposalsFts(driver);
			const repaired = driver.handle
				.query<{ uid: string }, []>('SELECT uid FROM proposals_fts ORDER BY uid')
				.all();
			expect(repaired.map((row) => row.uid)).toEqual([...inserted].sort());
		} finally {
			driver.close();
		}
	});
});
