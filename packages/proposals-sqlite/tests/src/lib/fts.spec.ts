import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ProposalsSqliteDriver } from '../../../src';

const makeTmpDir = (): string =>
	mkdtempSync(join(tmpdir(), 'proposals-sqlite-fts-'));

describe('proposals FTS5 (f00516 S1)', () => {
	let dir: string;
	let activePath: string;

	beforeEach(() => {
		dir = makeTmpDir();
		activePath = join(dir, 'proposals.sqlite');
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('applies migration 0010 and creates the three virtual tables', () => {
		const driver = new ProposalsSqliteDriver({ path: activePath });
		try {
			const tables = driver.handle
				.query<{ name: string }, []>(
					"SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%_fts'"
				)
				.all()
				.map((row) => row.name)
				.sort();
			expect(tables).toEqual([
				'plans_fts',
				'proposals_fts',
				'slices_fts',
			]);
		} finally {
			driver.close();
		}
	});

	it('keeps proposals_fts in sync via the triggers on insert and delete', () => {
		const driver = new ProposalsSqliteDriver({ path: activePath });
		try {
			const now = Date.now();
			driver.handle
				.prepare(
					`INSERT INTO proposals (
						uid, slug, kind, status, title, revision,
						created_at, updated_at
					) VALUES (?, ?, 'feat', 'ready', ?, 0, ?, ?)`
				)
				.run('x00516/S1', 'x00516-s1', 'alpha bravo', now, now);
			const insert = driver.handle
				.query<
					{ title: string },
					[string]
				>(`SELECT title FROM proposals_fts WHERE uid = ?`)
				.get('x00516/S1');
			expect(insert?.title).toBe('alpha bravo');

			driver.handle
				.prepare(`DELETE FROM proposals WHERE uid = ?`)
				.run('x00516/S1');
			const afterDelete = driver.handle
				.query<
					{ title: string },
					[string]
				>(`SELECT title FROM proposals_fts WHERE uid = ?`)
				.get('x00516/S1');
			expect(afterDelete).toBeNull();
		} finally {
			driver.close();
		}
	});

	it('returns ranked matches with bm25 over proposals_fts', () => {
		const driver = new ProposalsSqliteDriver({ path: activePath });
		try {
			const now = Date.now();
			const insert = driver.handle.prepare(
				`INSERT INTO proposals (
					uid, slug, kind, status, title, revision,
					created_at, updated_at
				) VALUES (?, ?, 'feat', 'ready', ?, 0, ?, ?)`
			);
			insert.run('x00516/S-keep', 'x00516-s-keep', 'rebalance', now, now);
			insert.run(
				'x00516/S-other',
				'x00516-s-other',
				'unrelated title',
				now,
				now
			);
			const hits = driver.handle
				.query<{ uid: string; title: string }, [string]>(
					`SELECT uid, title
					 FROM proposals_fts
					 WHERE proposals_fts MATCH ?
					 ORDER BY bm25(proposals_fts)`
				)
				.all('rebalance');
			expect(hits.map((hit) => hit.uid)).toEqual(['x00516/S-keep']);
		} finally {
			driver.close();
		}
	});

	it('keeps slices_fts in sync when a slice is inserted', () => {
		const driver = new ProposalsSqliteDriver({ path: activePath });
		try {
			const now = Date.now();
			driver.handle
				.prepare(
					`INSERT INTO proposals (
						uid, slug, kind, status, title, revision,
						created_at, updated_at
					) VALUES (?, ?, 'feat', 'ready', 'parent', 0, ?, ?)`
				)
				.run('x00516/S-parent', 'x00516-s-parent', now, now);
			const proposalId = driver.handle
				.query<
					{ id: number },
					[string]
				>(`SELECT id FROM proposals WHERE uid = ?`)
				.get('x00516/S-parent');
			if (proposalId === null) throw new Error('proposal id missing');
			driver.handle
				.prepare(
					`INSERT INTO plans (
						uid, proposal_id, slug, title, revision,
						created_at, updated_at
					) VALUES (?, ?, 'plan', 'the plan', 0, ?, ?)`
				)
				.run('x00516/P1', proposalId.id, now, now);
			const planId = driver.handle
				.query<
					{ id: number },
					[string]
				>(`SELECT id FROM plans WHERE uid = ?`)
				.get('x00516/P1');
			if (planId === null) throw new Error('plan id missing');
			driver.handle
				.prepare(
					`INSERT INTO slices (
						uid, plan_id, slug, title, revision,
						created_at, updated_at
					) VALUES (?, ?, 'slice', 'famous slice', 0, ?, ?)`
				)
				.run('x00516/S1', planId.id, now, now);
			const sliceHit = driver.handle
				.query<
					{ uid: string },
					[string]
				>(`SELECT uid FROM slices_fts WHERE slices_fts MATCH ?`)
				.all('famous');
			expect(sliceHit.map((hit) => hit.uid)).toEqual(['x00516/S1']);
		} finally {
			driver.close();
		}
	});
});
