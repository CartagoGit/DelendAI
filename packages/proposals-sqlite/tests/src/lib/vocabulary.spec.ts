/**
 * vocabulary.spec.ts — x00539 S1.
 *
 * The vocabulary module and the CHECK enums in the migration SQL are
 * two spellings of one ontology. These tests are what makes "they
 * cannot drift" true: the TS lists and the SQL enums are compared as
 * sets in both directions, so adding a kind to either side alone fails
 * here.
 *
 * The fixtures are the values this repository actually carries — the
 * three `kind: infra` files, a `## Slices` status written as prose —
 * not invented ones. Every defect x00539 fixes was found by running
 * the pipeline on the real tree, never by reading a tidy fixture.
 */
import { describe, expect, it } from 'vitest';

import { Database } from 'bun:sqlite';

import {
	LIFECYCLE_STATUS_VOCABULARY,
	PROPOSAL_KIND_VOCABULARY,
	VocabularyViolationError,
	isLifecycleStatus,
	isProposalKind,
	normalizeLifecycleStatus,
	normalizeProposalKind,
	readColumnVocabularyFromMigrations,
} from '../../../src/lib/vocabulary';
import { applyMigrations } from '../../../src/lib/migrations';

describe('vocabulary ↔ column enum parity (x00539 S1)', () => {
	it('proposals.kind: the TS vocabulary and the SQL CHECK enum are the same set', () => {
		const sql = readColumnVocabularyFromMigrations('proposals', 'kind');
		expect([...sql].sort()).toEqual([...PROPOSAL_KIND_VOCABULARY].sort());
	});

	it('proposals.status: the TS vocabulary and the SQL CHECK enum are the same set', () => {
		const sql = readColumnVocabularyFromMigrations('proposals', 'status');
		expect([...sql].sort()).toEqual(
			[...LIFECYCLE_STATUS_VOCABULARY].sort(),
		);
	});

	it('plans.status and slices.status carry the same lifecycle enum', () => {
		for (const table of ['plans', 'slices']) {
			const sql = readColumnVocabularyFromMigrations(table, 'status');
			expect([...sql].sort()).toEqual(
				[...LIFECYCLE_STATUS_VOCABULARY].sort(),
			);
		}
	});

	it('a live database accepts every kind in the vocabulary and nothing else', () => {
		const db = new Database(':memory:', { create: true, strict: true });
		try {
			db.exec('PRAGMA foreign_keys = ON;');
			applyMigrations(db);
			for (const kind of PROPOSAL_KIND_VOCABULARY) {
				db.prepare(
					`INSERT INTO proposals (uid, slug, kind, status, title, created_at, updated_at)
					 VALUES (?, ?, ?, 'ready', 't', 0, 0)`,
				).run(`uid-${kind}`, `uid-${kind}`, kind);
			}
			expect(
				db
					.query<{ readonly count: number }, []>(
						'SELECT COUNT(*) AS count FROM proposals',
					)
					.get()?.count,
			).toBe(PROPOSAL_KIND_VOCABULARY.length);
			expect(() =>
				db
					.prepare(
						`INSERT INTO proposals (uid, slug, kind, status, title, created_at, updated_at)
						 VALUES ('nope', 'nope', 'not-a-kind', 'ready', 't', 0, 0)`,
					)
					.run(),
			).toThrow(/CHECK/);
		} finally {
			db.close();
		}
	});
});

describe('normalisation (x00539 S1)', () => {
	it("keeps 'infra' — it is a canonical kind, not an alias", () => {
		// i00002 / i00003 / i00004 on disk. The proposals plugin gives
		// `infra` its own prefix (`i`), its own `done/infras/` folder
		// and its own cascade slot, so it is a family, not a synonym
		// for `chore`.
		expect(normalizeProposalKind('infra')).toBe('infra');
		expect(isProposalKind('infra')).toBe(true);
	});

	it('normalises case and whitespace', () => {
		expect(normalizeProposalKind('  FIX ')).toBe('fix');
		expect(normalizeLifecycleStatus('  Done ')).toBe('done');
	});

	it('resolves known synonyms to the canonical kind', () => {
		expect(normalizeProposalKind('feature')).toBe('feat');
		expect(normalizeProposalKind('bugfix')).toBe('fix');
		expect(normalizeProposalKind('infrastructure')).toBe('infra');
	});

	it('reads only the first token of a prose status', () => {
		// Real shapes from the tree: `done (S2.x, S3.x all green)`,
		// `promoted → x00165`, `pending`.
		expect(
			normalizeLifecycleStatus('done (S2.x, S3.x, S4-ratchet all green)'),
		).toBe('done');
		expect(normalizeLifecycleStatus('promoted → x00165')).toBe(
			'superseded',
		);
		expect(normalizeLifecycleStatus('pending')).toBe('ready');
		expect(normalizeLifecycleStatus('parked')).toBe('paused');
		expect(isLifecycleStatus('quarantined')).toBe(true);
	});

	it('returns null for an unknown or absent value instead of guessing', () => {
		expect(normalizeProposalKind('wat')).toBeNull();
		expect(normalizeProposalKind(null)).toBeNull();
		expect(normalizeProposalKind('')).toBeNull();
		expect(normalizeLifecycleStatus('wat')).toBeNull();
		expect(normalizeLifecycleStatus(undefined)).toBeNull();
	});

	it('VocabularyViolationError names the column, the value and the entity', () => {
		const error = new VocabularyViolationError('kind', 'wat', 'x00539');
		expect(error.name).toBe('VocabularyViolationError');
		expect(error.message).toContain('x00539');
		expect(error.message).toContain('kind');
		expect(error.message).toContain('wat');
		expect(
			new VocabularyViolationError('status', null, 'x1').message,
		).toContain('is missing');
	});
});
