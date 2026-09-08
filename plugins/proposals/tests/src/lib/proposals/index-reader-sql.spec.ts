/**
 * index-reader-sql.spec.ts — f00535 S1.
 *
 * `bun test`, never vitest: this file reaches `bun:sqlite` through
 * `@delendai/proposals-sqlite` and vitest cannot resolve that module
 * (ERR_MODULE_NOT_FOUND).
 *
 * What is pinned:
 *   1. The field mapping the 9 consumer call sites depend on, field by
 *      field — a field a consumer reads but the SQL reader leaves
 *      unmapped fails here.
 *   2. `null` vs `[]`: absent / unreadable / too-old database -> `null`;
 *      a healthy but empty projection -> `[]`. Both directions, because
 *      collapsing them is how the JSON fallback is lost.
 *   3. A read-only open creates nothing on disk.
 *   4. Rows with no `source_path` are reported, never dropped silently.
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	ProposalsSqliteDriver,
	resolveProposalsDbPaths,
} from '@delendai/proposals-sqlite';

import type { IProposalIndexEntry } from '../../../../src/lib/proposals/index-reader';
import {
	MIN_INDEX_SCHEMA_VERSION,
	readProposalIndexFromSql,
	readProposalIndexResultFromSql,
	type IReadonlyProposalsDb,
} from '../../../../src/lib/proposals/index-reader-sql';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const makeRoot = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'f00535-sql-'));
	roots.push(root);
	return root;
};

interface ISeedRow {
	readonly uid: string;
	readonly kind: string;
	readonly status: string;
	readonly title: string;
	readonly sourcePath: string | null;
}

/** Builds a real projection at the canonical path and seeds it. */
const seedDatabase = (root: string, rows: readonly ISeedRow[]): string => {
	const { databasePath } = resolveProposalsDbPaths(root);
	const driver = new ProposalsSqliteDriver({ path: databasePath });
	const now = 1_700_000_000_000;
	const insert = driver.handle.prepare(
		`INSERT INTO proposals
		   (uid, slug, kind, status, title, source_path, created_at, updated_at)
		 VALUES ($uid, $slug, $kind, $status, $title, $source_path, $created, $updated)`,
	);
	for (const row of rows) {
		insert.run({
			uid: row.uid,
			slug: row.uid,
			kind: row.kind,
			status: row.status,
			title: row.title,
			source_path: row.sourcePath,
			created: now,
			updated: now,
		});
	}
	driver.close();
	return databasePath;
};

/**
 * The fields the index consumers actually read, one per call site.
 * Grepped from `readProposalIndex` usage inside the plugin:
 *
 *   services/search.ts:94                  entry.file, entry.id, entry.status
 *   proposals/blocked-by.ts:110            e.id, e.status
 *   tools/continue-proposal.tool.ts:296    candidate.id, entry.id, entry.file
 *   tools/continue-proposal.tool.ts:553    entry.status, entry.id
 *   tools/proposal-get.tool.ts:237         entry.file
 *   tools/incident-proposal.tool.ts:114    entry.file
 *
 * plus the three injected-reader consumers that go through
 * `blocked-by`'s `readProposalIndex` port (id, status).
 */
const CONSUMER_FIELDS: readonly {
	readonly field: keyof IProposalIndexEntry;
	readonly consumers: readonly string[];
}[] = [
	{
		field: 'id',
		consumers: [
			'services/search.ts',
			'proposals/blocked-by.ts',
			'tools/continue-proposal.tool.ts (resolveDoc)',
			'tools/continue-proposal.tool.ts (auto pick)',
		],
	},
	{
		field: 'file',
		consumers: [
			'services/search.ts',
			'tools/continue-proposal.tool.ts (resolveDoc)',
			'tools/proposal-get.tool.ts',
			'tools/incident-proposal.tool.ts',
		],
	},
	{
		field: 'status',
		consumers: [
			'services/search.ts',
			'proposals/blocked-by.ts',
			'tools/continue-proposal.tool.ts (auto pick)',
		],
	},
];

describe('readProposalIndexFromSql — field mapping (f00535 S1)', () => {
	it('maps every field the 9 consumer call sites read', async () => {
		const root = makeRoot();
		seedDatabase(root, [
			{
				uid: 'f00535',
				kind: 'feat',
				status: 'ready',
				title: 'cutover',
				sourcePath: 'ready/feats/f00535-cutover.md',
			},
		]);
		const entries = await readProposalIndexFromSql({
			databasePath: resolveProposalsDbPaths(root).databasePath,
		});
		expect(entries).not.toBeNull();
		const [entry] = entries ?? [];
		expect(entry).toBeDefined();
		for (const { field, consumers } of CONSUMER_FIELDS) {
			expect(
				entry?.[field],
				`field "${field}" is read by ${consumers.join(', ')} but the SQL reader left it unmapped`,
			).toBeDefined();
		}
		expect(entry).toEqual({
			id: 'f00535',
			file: 'ready/feats/f00535-cutover.md',
			status: 'ready',
		});
	});

	it('maps uid -> id, source_path -> file, status -> status for many rows, ordered by id', async () => {
		const root = makeRoot();
		seedDatabase(root, [
			{
				uid: 'q00022',
				kind: 'plan',
				status: 'in-progress',
				title: 'plan',
				sourcePath: 'in-progress/q00022-plan.md',
			},
			{
				uid: 'a00094',
				kind: 'audit',
				status: 'done',
				title: 'audit',
				sourcePath: 'done/audits/a00094-audit.md',
			},
		]);
		const entries = await readProposalIndexFromSql({
			databasePath: resolveProposalsDbPaths(root).databasePath,
		});
		expect(entries).toEqual([
			{
				id: 'a00094',
				file: 'done/audits/a00094-audit.md',
				status: 'done',
			},
			{
				id: 'q00022',
				file: 'in-progress/q00022-plan.md',
				status: 'in-progress',
			},
		]);
	});

	it('keeps `file` relative to the proposals dir, the shape index.json uses', async () => {
		const root = makeRoot();
		seedDatabase(root, [
			{
				uid: 'f00001',
				kind: 'feat',
				status: 'done',
				title: 't',
				sourcePath: 'legacy/closed/feats/f00001-x.md',
			},
		]);
		const entries = await readProposalIndexFromSql({
			databasePath: resolveProposalsDbPaths(root).databasePath,
		});
		expect(entries?.[0]?.file.startsWith('/')).toBe(false);
	});
});

describe('readProposalIndexFromSql — null vs empty (f00535 S1)', () => {
	it('returns [] (NOT null) when the database is healthy and holds no proposals', async () => {
		const root = makeRoot();
		seedDatabase(root, []);
		const entries = await readProposalIndexFromSql({
			databasePath: resolveProposalsDbPaths(root).databasePath,
		});
		expect(entries).not.toBeNull();
		expect(entries).toEqual([]);
	});

	it('returns null (NOT []) when the database file is absent', async () => {
		const root = makeRoot();
		const { databasePath } = resolveProposalsDbPaths(root);
		expect(existsSync(databasePath)).toBe(false);
		const entries = await readProposalIndexFromSql({ databasePath });
		expect(entries).toBeNull();
	});

	it('creates nothing on disk when the database is absent (read-only handle)', async () => {
		const root = makeRoot();
		const { stateDir, databasePath } = resolveProposalsDbPaths(root);
		await readProposalIndexFromSql({ databasePath });
		expect(existsSync(databasePath)).toBe(false);
		expect(existsSync(stateDir)).toBe(false);
	});

	it('returns null when the file exists but is not a database', async () => {
		const root = makeRoot();
		const databasePath = join(root, 'garbage.sqlite');
		writeFileSync(databasePath, 'this is not a sqlite file', 'utf8');
		const entries = await readProposalIndexFromSql({ databasePath });
		expect(entries).toBeNull();
	});

	it('returns null when the schema predates the proposals projection', async () => {
		const tooOld: IReadonlyProposalsDb = {
			schemaVersion: MIN_INDEX_SCHEMA_VERSION - 1,
			query: () => ({
				all: () => {
					throw new Error(
						'must not query a schema older than the projection',
					);
				},
			}),
			close: () => undefined,
		};
		const entries = await readProposalIndexFromSql({
			databasePath: '/nowhere/proposals.sqlite',
			open: () => tooOld,
		});
		expect(entries).toBeNull();
	});

	it('returns null when the query itself fails (table missing on a versioned schema)', async () => {
		const broken: IReadonlyProposalsDb = {
			schemaVersion: MIN_INDEX_SCHEMA_VERSION,
			query: () => ({
				all: () => {
					throw new Error('no such table: proposals');
				},
			}),
			close: () => undefined,
		};
		const entries = await readProposalIndexFromSql({
			databasePath: '/nowhere/proposals.sqlite',
			open: () => broken,
		});
		expect(entries).toBeNull();
	});

	it('closes the handle on both the success and the failure path', async () => {
		let closed = 0;
		const ok: IReadonlyProposalsDb = {
			schemaVersion: MIN_INDEX_SCHEMA_VERSION,
			query: () => ({ all: () => [] }),
			close: () => {
				closed += 1;
			},
		};
		const failing: IReadonlyProposalsDb = {
			schemaVersion: MIN_INDEX_SCHEMA_VERSION,
			query: () => ({
				all: () => {
					throw new Error('boom');
				},
			}),
			close: () => {
				closed += 1;
			},
		};
		await readProposalIndexFromSql({
			databasePath: 'x',
			open: () => ok,
		});
		await readProposalIndexFromSql({
			databasePath: 'x',
			open: () => failing,
		});
		expect(closed).toBe(2);
	});
});

describe('readProposalIndexResultFromSql — unusable rows (f00535 S1)', () => {
	it('reports proposals with no source_path instead of dropping them silently', async () => {
		const root = makeRoot();
		seedDatabase(root, [
			{
				uid: 'f00001',
				kind: 'feat',
				status: 'ready',
				title: 'has a path',
				sourcePath: 'ready/feats/f00001-x.md',
			},
			{
				uid: 'f00002',
				kind: 'feat',
				status: 'ready',
				title: 'no path',
				sourcePath: null,
			},
		]);
		const result = await readProposalIndexResultFromSql({
			databasePath: resolveProposalsDbPaths(root).databasePath,
		});
		expect(result?.entries.map((entry) => entry.id)).toEqual(['f00001']);
		expect(result?.skipped).toEqual(['f00002']);
	});

	it('reports "cannot serve" as null at the result level too', async () => {
		const root = makeRoot();
		const result = await readProposalIndexResultFromSql({
			databasePath: resolveProposalsDbPaths(root).databasePath,
		});
		expect(result).toBeNull();
	});
});
