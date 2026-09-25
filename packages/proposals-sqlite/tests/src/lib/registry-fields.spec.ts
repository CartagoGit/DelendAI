/**
 * registry-fields.spec.ts — q00022 S4 (phase 1): the proposals table
 * carries every field the registry lists, so the registry can one day be
 * exported from the database instead of a second scan of the markdown.
 */
import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import {
	MIGRATION_CHECKSUMS,
	MIGRATION_FILES,
	applyMigrations,
	readMigrationSource,
} from '../../../src/lib/migrations';
import {
	reconcileProposalMarkdown,
	type IProposalCandidate,
} from '../../../src/lib/reconciler-markdown';
import { ProposalRepo } from '../../../src/lib/repository/proposals-repo';

/** A database built by the migrations before `version`, as it was then. */
const atVersion = (version: number): Database => {
	const db = new Database(':memory:');
	db.exec(`CREATE TABLE schema_migrations (
		version INTEGER PRIMARY KEY, name TEXT NOT NULL,
		checksum TEXT NOT NULL, applied_at INTEGER NOT NULL);`);
	for (const name of MIGRATION_FILES) {
		const at = Number.parseInt(name.slice(0, 4), 10);
		if (at >= version) continue;
		db.exec('PRAGMA foreign_keys = OFF;');
		db.exec(readMigrationSource(name));
		db.exec('PRAGMA foreign_keys = ON;');
		db.prepare(
			'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
		).run(
			at,
			name,
			MIGRATION_CHECKSUMS[name] ?? '',
			1_700_000_000_000 + at,
		);
	}
	return db;
};

const columnsOf = (db: Database): readonly string[] =>
	(db.query('PRAGMA table_info(proposals)').all() as { name: string }[]).map(
		(column) => column.name,
	);

const candidate = (
	overrides: Partial<IProposalCandidate> = {},
): IProposalCandidate => ({
	uid: 'q00022',
	slug: 'q00022-proposals-sqlite',
	path: 'ready/plans/q00022-proposals-sqlite.md',
	title: 'Proposals SQLite',
	kind: 'plan',
	status: 'ready',
	type: 'proposal',
	track: 'architecture',
	date: '2026-09-07',
	frontmatterJson: '{}',
	bodyHash: 'body-1',
	...overrides,
});

const fieldsOf = (db: Database, uid: string) =>
	db
		.query(
			'SELECT track, type, proposal_date AS date FROM proposals WHERE uid = ?',
		)
		.get(uid);

describe('the proposals table carries the registry fields', () => {
	it('has track, type and date on a fresh database', () => {
		const db = new Database(':memory:');
		applyMigrations(db);
		expect(columnsOf(db)).toEqual(
			expect.arrayContaining(['track', 'type', 'proposal_date']),
		);
	});

	it('adds them to an existing database, keeping its rows and STRICT', () => {
		const db = atVersion(21);
		db.prepare(
			"INSERT INTO proposals (uid, slug, kind, status, title, created_at, updated_at) VALUES ('x00001', 'x00001', 'fix', 'ready', 't', 1, 1)",
		).run();

		applyMigrations(db);

		expect(fieldsOf(db, 'x00001')).toEqual({
			track: null,
			type: null,
			date: null,
		});
		const table = (
			db.query('PRAGMA table_list').all() as {
				name: string;
				strict: number;
			}[]
		).find((entry) => entry.name === 'proposals');
		expect(table?.strict).toBe(1);
	});

	it('projects them from a candidate, and rewrites a row when only they change', () => {
		const db = new Database(':memory:');
		applyMigrations(db);
		const repo = new ProposalRepo(db);

		expect(repo.upsertProjection(candidate()).kind).toBe('created');
		expect(fieldsOf(db, 'q00022')).toEqual({
			track: 'architecture',
			type: 'proposal',
			date: '2026-09-07',
		});
		expect(repo.upsertProjection(candidate()).kind).toBe('unchanged');
		expect(repo.upsertProjection(candidate({ track: 'trust' })).kind).toBe(
			'updated',
		);
		expect(fieldsOf(db, 'q00022')).toMatchObject({ track: 'trust' });
	});

	it('fills a row the migration left empty on the next reconcile', () => {
		const db = new Database(':memory:');
		applyMigrations(db);
		const repo = new ProposalRepo(db);
		repo.upsertProjection(
			candidate({ track: null, type: null, date: null }),
		);

		expect(repo.upsertProjection(candidate()).kind).toBe('updated');
		expect(fieldsOf(db, 'q00022')).toEqual({
			track: 'architecture',
			type: 'proposal',
			date: '2026-09-07',
		});
	});

	it('reads the date from the frontmatter, and null when it is absent', () => {
		const file = (id: string, extra: string) => ({
			path: `ready/fixes/${id}-a-fix.md`,
			raw: `---\nid: ${id}\nkind: fix\nstatus: ready\ntype: proposal\ntrack: trust\n${extra}---\n\n# ${id} — A fix\n`,
		});
		const result = reconcileProposalMarkdown({
			sourceCommit: 'c',
			mode: 'shadow',
			files: [file('x00901', 'date: 2026-09-25\n'), file('x00902', '')],
		});

		expect(
			result.proposals.map((proposal) => [
				proposal.uid,
				proposal.date,
				proposal.track,
			]),
		).toEqual([
			['x00901', '2026-09-25', 'trust'],
			['x00902', null, 'trust'],
		]);
	});

	it('keeps the parsed frontmatter, extras included, for the registry to derive from', () => {
		const db = new Database(':memory:');
		applyMigrations(db);
		const [proposal] = reconcileProposalMarkdown({
			sourceCommit: 'c',
			mode: 'shadow',
			files: [
				{
					path: 'ready/fixes/x00903-a-fix.md',
					raw: '---\nid: x00903\nkind: fix\nstatus: ready\nownership:\n  - plugins/proposals/**\n---\n\n# x00903 — A fix\n',
				},
			],
		}).proposals;
		new ProposalRepo(db).upsertProjection(proposal!);

		const row = db
			.query(
				"SELECT frontmatter_json AS json FROM proposals WHERE uid = 'x00903'",
			)
			.get() as { json: string };
		expect(JSON.parse(row.json)).toEqual({
			id: 'x00903',
			kind: 'fix',
			status: 'ready',
			ownership: ['plugins/proposals/**'],
		});
	});
});
