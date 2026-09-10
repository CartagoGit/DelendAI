/**
 * revision-cas.spec.ts — r00048 S1/S3.
 *
 * Two halves are under test, and they are not the same guarantee.
 *
 * The CAS predicate decides WHOSE write wins when two writers hold the
 * same revision. The migration triggers decide whether a revision
 * sequence is coherent AT ALL, including for a writer that never went
 * through a repository — which is why the direct-SQL cases below matter
 * as much as the racing ones.
 *
 * The race is run across separate CONNECTIONS on a real file, not two
 * calls on one handle. A single connection serialises itself, so a
 * same-handle "race" proves nothing about the property being claimed.
 */
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { applyMigrations } from '../../../../src/lib/migrations';
import {
	casUpdate,
	REVISION_TABLES,
} from '../../../../src/lib/repository/revision-cas';

const directories: string[] = [];

afterEach(() => {
	for (const directory of directories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

/** A migrated database on disk, so a second connection can open it. */
const databaseFile = (): string => {
	const directory = mkdtempSync(join(tmpdir(), 'revision-cas-'));
	directories.push(directory);
	const path = join(directory, 'proposals.sqlite');
	const db = new Database(path);
	applyMigrations(db);
	db.close();
	return path;
};

const seedProposal = (db: Database, uid: string): void => {
	db.run(
		`INSERT INTO proposals
		   (uid, slug, kind, status, title, source_path, content_hash,
		    created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[uid, uid, 'feat', 'ready', 'T', `${uid}.md`, 'hash', 1, 1],
	);
};

describe('revision compare-and-swap', () => {
	it('lets exactly one of two racing connections win', () => {
		const path = databaseFile();
		const seeder = new Database(path);
		seedProposal(seeder, 'u1');
		seeder.close();

		// SEPARATE connections. Two calls on one handle would be
		// serialised by that handle and would prove nothing.
		const first = new Database(path);
		const second = new Database(path);
		try {
			const outcomes = [first, second].map((db) =>
				casUpdate(db, {
					table: 'proposals',
					uid: 'u1',
					expectedRevision: 0,
					patch: { status: 'review', updated_at: 2 },
				}),
			);

			expect(outcomes.filter((o) => o.kind === 'updated')).toHaveLength(
				1,
			);
			const loser = outcomes.find((o) => o.kind === 'conflict');
			expect(loser).toEqual({ kind: 'conflict', currentRevision: 1 });
		} finally {
			first.close();
			second.close();
		}
	});

	it('reports a missing row as missing, not as a lost race', () => {
		// Telling a caller it lost a race would send it to retry
		// something that can never succeed.
		const path = databaseFile();
		const db = new Database(path);
		try {
			expect(
				casUpdate(db, {
					table: 'proposals',
					uid: 'never-existed',
					expectedRevision: 0,
					patch: { status: 'done' },
				}),
			).toEqual({ kind: 'missing' });
		} finally {
			db.close();
		}
	});

	it('leaves the loser’s values entirely unwritten', () => {
		const path = databaseFile();
		const db = new Database(path);
		try {
			seedProposal(db, 'u2');
			casUpdate(db, {
				table: 'proposals',
				uid: 'u2',
				expectedRevision: 0,
				patch: { status: 'review' },
			});
			casUpdate(db, {
				table: 'proposals',
				uid: 'u2',
				expectedRevision: 0,
				patch: { status: 'done', title: 'clobbered' },
			});

			// Not "the winner's status with the loser's title": nothing
			// of the losing patch reached the row.
			expect(
				db
					.query(
						'SELECT status, title, revision FROM proposals WHERE uid = ?',
					)
					.get('u2'),
			).toEqual({ status: 'review', title: 'T', revision: 1 });
		} finally {
			db.close();
		}
	});

	it('refuses a patch naming a column that is not writable', () => {
		const path = databaseFile();
		const db = new Database(path);
		try {
			seedProposal(db, 'u3');
			// `revision` is the primitive's own business; letting a
			// caller set it would defeat the whole mechanism.
			expect(() =>
				casUpdate(db, {
					table: 'proposals',
					uid: 'u3',
					expectedRevision: 0,
					patch: { revision: 9 },
				}),
			).toThrow('no writable column');
		} finally {
			db.close();
		}
	});

	it('refuses an empty patch rather than consuming a revision for nothing', () => {
		const path = databaseFile();
		const db = new Database(path);
		try {
			seedProposal(db, 'u4');
			expect(() =>
				casUpdate(db, {
					table: 'proposals',
					uid: 'u4',
					expectedRevision: 0,
					patch: {},
				}),
			).toThrow('empty patch');
		} finally {
			db.close();
		}
	});
});

describe('revision step guards (migration 0018)', () => {
	it('rejects skipped, repeated and rewound revisions from direct SQL', () => {
		// The guard that CAS cannot provide: this writer never went
		// through a repository.
		const path = databaseFile();
		const db = new Database(path);
		try {
			seedProposal(db, 'u5');
			for (const expression of [
				'revision + 2',
				'revision',
				'revision - 1',
			]) {
				expect(
					() =>
						db.run(
							`UPDATE proposals SET revision = ${expression} WHERE uid = ?`,
							['u5'],
						),
					expression,
				).toThrow('must advance by exactly one');
			}
			// The legitimate step still works.
			db.run(
				'UPDATE proposals SET revision = revision + 1 WHERE uid = ?',
				['u5'],
			);
			expect(
				db
					.query('SELECT revision FROM proposals WHERE uid = ?')
					.get('u5'),
			).toEqual({ revision: 1 });
		} finally {
			db.close();
		}
	});

	it('guards every table that carries a revision', () => {
		const path = databaseFile();
		const db = new Database(path);
		try {
			const guarded = db
				.query<{ name: string }, []>(
					`SELECT name FROM sqlite_master
					 WHERE type = 'trigger' AND name LIKE '%_revision_steps_by_one'`,
				)
				.all()
				.map((row) => row.name);
			for (const table of REVISION_TABLES) {
				expect(guarded).toContain(`${table}_revision_steps_by_one`);
			}
		} finally {
			db.close();
		}
	});
});
