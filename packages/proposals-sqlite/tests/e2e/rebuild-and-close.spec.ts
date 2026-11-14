/**
 * rebuild-and-close.spec.ts — q00022 S5.
 *
 * The rebuild the plan promises is judged on what the database HOLDS, not
 * on the digest of the parsed candidates (a pure function of the files,
 * equal by construction): a domain digest over proposals, plans and
 * slices, without row ids, timestamps or revisions.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	ProposalRepo,
	ProposalsSqliteDriver,
	reconcileIncremental,
	reconcileShadowToStaging,
	resolveProposalsDbPaths,
} from '../../src';
import { largeProposalSet } from '../fixtures/large-proposal-set';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const freshRoot = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'rebuild-and-close-'));
	roots.push(root);
	return root;
};

/** What the database holds, without ids, timestamps or revisions. */
const domainDigest = (path: string): string => {
	const db = new ProposalsSqliteDriver({ path, readonly: true });
	try {
		const rows = {
			proposals: db.handle
				.query(
					`SELECT uid, slug, kind, status, title, source_path, content_hash,
						track, type, proposal_date, frontmatter_json,
						deleted_at IS NOT NULL AS deleted
					 FROM proposals ORDER BY uid`,
				)
				.all(),
			plans: db.handle
				.query(
					`SELECT plans.uid, proposals.uid AS proposal, plans.slug, plans.title,
						plans.source_path, plans.status
					 FROM plans JOIN proposals ON proposals.id = plans.proposal_id
					 ORDER BY plans.uid`,
				)
				.all(),
			slices: db.handle
				.query(
					`SELECT slices.uid, plans.uid AS plan, slices.slug, slices.title,
						slices.source_path, slices.status
					 FROM slices JOIN plans ON plans.id = slices.plan_id
					 ORDER BY slices.uid`,
				)
				.all(),
		};
		return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
	} finally {
		db.close();
	}
};

const buildIncremental = (databasePath: string): void => {
	reconcileIncremental({
		databasePath,
		sourceCommit: 'fixture-commit',
		files: largeProposalSet(),
		now: Date.parse('2026-09-25T12:00:00.000Z'),
	});
};

describe('deleting the database and reconciling again (q00022 S5)', () => {
	it('rebuilds the same database, every time', () => {
		const databasePath = resolveProposalsDbPaths(freshRoot()).databasePath;
		buildIncremental(databasePath);
		const before = domainDigest(databasePath);
		expect(before).toMatch(/^[0-9a-f]{64}$/u);

		for (let run = 0; run < 100; run += 1) {
			for (const suffix of ['', '-wal', '-shm']) {
				rmSync(`${databasePath}${suffix}`, { force: true });
			}
			buildIncremental(databasePath);
			expect(domainDigest(databasePath)).toBe(before);
		}
		// A hundred full rebuilds of a 50+ proposal fixture: ~11 s here.
	}, 120_000);

	it('holds what a shadow build holds', () => {
		const root = freshRoot();
		const { stateDir, databasePath } = resolveProposalsDbPaths(root);
		buildIncremental(databasePath);
		const staging = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath: join(root, 'workspace'),
			statePath: stateDir,
			sourceCommit: 'fixture-commit',
			sha: 'fixture-tree',
			files: largeProposalSet(),
			now: Date.parse('2026-09-25T12:00:00.000Z'),
		});

		expect(domainDigest(staging.stagingPath)).toBe(
			domainDigest(databasePath),
		);
	});
});

describe('closing one proposal from many connections at once (q00022 S5)', () => {
	it('closes it exactly once; every other writer is told it is already closed', () => {
		const databasePath = resolveProposalsDbPaths(freshRoot()).databasePath;
		const seeder = new ProposalsSqliteDriver({ path: databasePath });
		new ProposalRepo(seeder.handle).upsertProjection(
			{
				uid: 'close-me',
				slug: 'close-me',
				path: 'ready/feats/close-me.md',
				title: 'Close me',
				kind: 'feat',
				status: 'ready',
				type: 'proposal',
				track: 'general',
				date: null,
				frontmatterJson: '{}',
				bodyHash: 'close-me',
			},
			100,
		);
		seeder.close();

		const writers = Array.from(
			{ length: 6 },
			() => new ProposalsSqliteDriver({ path: databasePath }),
		);
		try {
			const outcomes = writers.map(
				(writer, index) =>
					new ProposalRepo(writer.handle).closeProposal({
						uid: 'close-me',
						actor: `writer-${String(index)}`,
						source: 'race',
						now: 200 + index,
					}).kind,
			);

			expect(outcomes.filter((kind) => kind === 'closed')).toHaveLength(
				1,
			);
			expect(
				outcomes.filter((kind) => kind === 'already_closed'),
			).toHaveLength(5);
			expect(
				writers[0]?.handle
					.query<{ n: number }, []>(
						"SELECT COUNT(*) AS n FROM lifecycle_events WHERE entity_uid = 'close-me'",
					)
					.get()?.n,
			).toBe(1);
		} finally {
			for (const writer of writers) writer.close();
		}
	});
});
