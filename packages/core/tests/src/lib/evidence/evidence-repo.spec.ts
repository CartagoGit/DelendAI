import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import { createEvidenceRepo } from '@delendai/core/lib/evidence/evidence-repo';
import type { IEvidenceRepo } from '@delendai/core/lib/evidence/evidence-repo';

const roots: string[] = [];
const repos: IEvidenceRepo[] = [];

afterEach(async () => {
	for (const repo of repos.splice(0)) {
		try {
			repo.close();
		} catch {
			// already closed by the test
		}
	}
	await Promise.all(
		roots
			.splice(0)
			.map((root) => rm(root, { recursive: true, force: true })),
	);
});

const makeRepo = async (): Promise<IEvidenceRepo> => {
	const root = await mkdtemp(join(tmpdir(), 'delendai-evidence-repo-'));
	roots.push(root);
	const repo = createEvidenceRepo({
		path: join(root, 'db', 'evidence.sqlite'),
	});
	repos.push(repo);
	return repo;
};

const DAY_MS = 24 * 60 * 60 * 1000;

describe('evidence repo (sqlite)', () => {
	it('creates the evidence table in STRICT mode with indices on type and recorded_at', async () => {
		const repo = await makeRepo();
		repo.append({ type: 'surface', recordedAt: 1, payload: '{}' });

		// `sqlite_schema` is the authority on what was actually created.
		const table = repo
			.listByType('surface')
			.length; /* forces the statement path to be exercised */
		expect(table).toBe(1);

		const ddl = readSchema(repo, 'table', 'evidence');
		expect(ddl).toContain('STRICT');
		for (const column of ['id', 'type', 'recorded_at', 'payload']) {
			expect(ddl).toContain(column);
		}

		const indices = readIndexNames(repo);
		expect(indices).toContain('idx_evidence_type');
		expect(indices).toContain('idx_evidence_recorded_at');
	});

	it('rejects a payload of the wrong storage class because the table is STRICT', async () => {
		const repo = await makeRepo();
		// STRICT means SQLite itself refuses a non-TEXT payload rather
		// than silently coercing it, which is the property we want.
		expect(() =>
			rawRun(
				repo,
				"INSERT INTO evidence (type, recorded_at, payload) VALUES ('surface', 1, X'00')",
			),
		).toThrow();
	});

	it('lists by type, newest first, without leaking other types', async () => {
		const repo = await makeRepo();
		repo.append({ type: 'surface', recordedAt: 100, payload: '{"a":1}' });
		repo.append({ type: 'surface', recordedAt: 300, payload: '{"a":3}' });
		repo.append({ type: 'skills', recordedAt: 200, payload: '{"a":2}' });

		const surface = repo.listByType('surface');
		expect(surface.map((row) => row.recordedAt)).toEqual([300, 100]);
		expect(repo.listByType('surface', { limit: 1 })).toHaveLength(1);
		expect(repo.countByType('skills')).toBe(1);
	});

	it('prunes by age', async () => {
		const repo = await makeRepo();
		const now = Date.now();
		repo.append({
			type: 'diagnostic',
			recordedAt: now - 10 * DAY_MS,
			payload: '{"old":true}',
		});
		repo.append({
			type: 'diagnostic',
			recordedAt: now,
			payload: '{"old":false}',
		});

		const result = repo.prune({ olderThanDays: 5 });
		expect(result.byAge).toBe(1);
		expect(repo.count()).toBe(1);
		expect(repo.listByType('diagnostic')[0]?.payload).toBe('{"old":false}');
	});

	it('prunes by keepLastN scoped to a single type', async () => {
		const repo = await makeRepo();
		for (let i = 0; i < 10; i += 1) {
			repo.append({ type: 'surface', recordedAt: i, payload: `${i}` });
			repo.append({ type: 'skills', recordedAt: i, payload: `${i}` });
		}
		const result = repo.prune({ keepLastN: 3, type: 'surface' });
		expect(result.byCount).toBe(7);
		expect(repo.countByType('surface')).toBe(3);
		expect(repo.countByType('skills')).toBe(10);
	});

	// f00533 S1 acceptance, verbatim: "Escribir 10.000 entradas y podar a
	// keepLastN 1.000 deja exactamente 1.000 filas, las mas recientes."
	it('keeps exactly the 1.000 most recent of 10.000 entries and stays integrity-clean', async () => {
		const repo = await makeRepo();
		const entries = Array.from({ length: 10_000 }, (_, index) => ({
			type: 'surface' as const,
			recordedAt: index,
			payload: JSON.stringify({ index }),
		}));

		const writeStart = performance.now();
		repo.appendMany(entries);
		const writeMs = performance.now() - writeStart;
		expect(repo.count()).toBe(10_000);

		const pruneStart = performance.now();
		const result = repo.prune({ keepLastN: 1_000 });
		const pruneMs = performance.now() - pruneStart;

		expect(result.byCount).toBe(9_000);
		expect(repo.count()).toBe(1_000);

		const survivors = repo.listByType('surface');
		expect(survivors).toHaveLength(1_000);
		// Newest first: 9999 down to 9000, i.e. exactly the tail.
		expect(survivors[0]?.recordedAt).toBe(9_999);
		expect(survivors[survivors.length - 1]?.recordedAt).toBe(9_000);

		expect(repo.integrityCheck()).toEqual(['ok']);

		// Printed so the acceptance timing is a measured number in the
		// test log rather than a claim in a report.
		console.log(
			`[f00533 S1] 10.000 appends in ${writeMs.toFixed(1)}ms, prune to 1.000 in ${pruneMs.toFixed(1)}ms`,
		);
	});

	it('reports integrity_check ok after mixed append and prune traffic', async () => {
		const repo = await makeRepo();
		for (let i = 0; i < 500; i += 1) {
			repo.append({
				type: i % 2 === 0 ? 'surface' : 'skills',
				recordedAt: i,
				payload: `{"i":${i}}`,
			});
		}
		repo.prune({ keepLastN: 50, type: 'surface' });
		repo.prune({ olderThanDays: 1 });
		expect(repo.integrityCheck()).toEqual(['ok']);
	});

	it('ignores a repeated source key so the migrator can be re-run', async () => {
		const repo = await makeRepo();
		repo.append({
			type: 'surface',
			recordedAt: 1,
			payload: '{}',
			sourceKey: 'surface/a.json',
		});
		repo.append({
			type: 'surface',
			recordedAt: 1,
			payload: '{}',
			sourceKey: 'surface/a.json',
		});
		expect(repo.count()).toBe(1);

		// NULL source keys stay unconstrained: live appends are not
		// deduplicated against each other.
		repo.append({ type: 'surface', recordedAt: 2, payload: '{}' });
		repo.append({ type: 'surface', recordedAt: 2, payload: '{}' });
		expect(repo.count()).toBe(3);
	});
});

/* --- test-local SQLite introspection ------------------------------ */

/**
 * The repository interface deliberately does not expose its handle;
 * the tests reopen the same file instead of widening the production
 * surface for test convenience.
 */
const withRawDb = <T>(
	repo: IEvidenceRepo,
	readonlyMode: boolean,
	use: (db: Database) => T,
): T => {
	const db = new Database(repo.dbPath, { readonly: readonlyMode });
	try {
		return use(db);
	} finally {
		db.close();
	}
};

const queryRaw = <T>(repo: IEvidenceRepo, sql: string): readonly T[] =>
	withRawDb(repo, true, (db) => db.query(sql).all() as readonly T[]);

const rawRun = (repo: IEvidenceRepo, sql: string): void => {
	withRawDb(repo, false, (db) => {
		db.run(sql);
	});
};

const readSchema = (
	repo: IEvidenceRepo,
	kind: 'table' | 'index',
	name: string,
): string => {
	const rows = queryRaw<{ sql: string | null }>(
		repo,
		`SELECT sql FROM sqlite_schema WHERE type = '${kind}' AND name = '${name}'`,
	);
	return rows[0]?.sql ?? '';
};

const readIndexNames = (repo: IEvidenceRepo): readonly string[] =>
	queryRaw<{ name: string }>(
		repo,
		"SELECT name FROM sqlite_schema WHERE type = 'index'",
	).map((row) => row.name);
