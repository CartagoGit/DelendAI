import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	ProposalsSqliteDriver,
	reconcileShadowToStaging,
	resolveProposalsDbPaths,
} from '../../../src';
import { classifyDisappearance } from '../../../src/lib/reconciler-tombstone';

const makeRoot = (): string =>
	mkdtempSync(join(tmpdir(), 'proposals-sqlite-tombstones-'));

describe('classifyDisappearance (f00519 S1)', () => {
	it('returns renamed when the same basename moved elsewhere', () => {
		expect(
			classifyDisappearance({
				previousPath: 'ready/fixes/x00001.md',
				currentPaths: ['ready/refactors/x00001.md'],
			}),
		).toEqual({
			reason: 'renamed',
			replacementPath: 'ready/refactors/x00001.md',
		});
	});

	it('returns moved-by-reorg when the replacement stays in the same directory', () => {
		expect(
			classifyDisappearance({
				previousPath: 'ready/fixes/x00001.md',
				currentPaths: ['ready/fixes/example.md'],
			}),
		).toEqual({
			reason: 'moved-by-reorg',
			replacementPath: 'ready/fixes/example.md',
		});
	});

	it('returns git-removed when the path is wholly absent', () => {
		expect(
			classifyDisappearance({
				previousPath: 'ready/fixes/x00001.md',
				currentPaths: ['archive/docs/readme.md'],
			}),
		).toEqual({ reason: 'git-removed', replacementPath: null });
	});

	it('returns unknown when the replacement is ambiguous', () => {
		expect(
			classifyDisappearance({
				previousPath: 'ready/fixes/x00001.md',
				currentPaths: [
					'ready/refactors/x00001.md',
					'archive/x00001.md',
				],
			}),
		).toEqual({ reason: 'unknown', replacementPath: null });
	});
});

describe('reconcileShadowToStaging tombstones (f00519 S1)', () => {
	let root: string;
	let workspacePath: string;
	let statePath: string;
	let databasePath: string;

	beforeEach(() => {
		root = makeRoot();
		workspacePath = join(root, 'workspace');
		const paths = resolveProposalsDbPaths(workspacePath);
		statePath = paths.stateDir;
		databasePath = paths.databasePath;
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('keeps a row alive and records path_history when a renamed path is still present in the tree', () => {
		const active = new ProposalsSqliteDriver({ path: databasePath });
		try {
			active.handle
				.prepare(
					`INSERT INTO proposals (
					uid, slug, kind, status, title, source_path, source_blob_sha,
					revision, content_hash, created_at, updated_at, closed_at,
					deleted_at, last_seen_at, last_seen_commit, tombstone_reason
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				)
				.run(
					'x00001',
					'x00001',
					'fix',
					'ready',
					'One',
					'ready/fixes/x00001.md',
					null,
					0,
					null,
					100,
					100,
					null,
					null,
					null,
					null,
					null,
				);
			active.handle
				.prepare(
					`INSERT INTO reconciliation_runs (
					source_commit, source_tree, reconciler_version, schema_version,
					started_at, completed_at, status, files_seen, files_changed,
					entities_created, entities_updated, entities_deleted,
					entities_quarantined, logical_digest, kind, error
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				)
				.run(
					'first-commit',
					'tree-first',
					'test',
					14,
					100,
					100,
					'ok',
					1,
					1,
					1,
					0,
					0,
					0,
					'digest',
					'shadow',
					null,
				);
		} finally {
			active.close();
		}

		const second = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath,
			statePath,
			sourceCommit: 'second-commit',
			sha: 'tree-second',
			files: [
				{
					path: 'ready/refactors/x00001.md',
					sha: 'blob-x00001-renamed',
					raw: `---\ntitle: One moved\nkind: fix\nstatus: ready\ntype: proposal\ntrack: general\n---\n# broken identity`,
				},
			],
			now: 200,
		});

		expect(second.status).toBe('degraded');
		const staged = new ProposalsSqliteDriver({
			path: second.stagingPath,
			readonly: true,
		});
		try {
			const proposal = staged.handle
				.query<
					{
						readonly uid: string;
						readonly source_path: string | null;
						readonly deleted_at: number | null;
						readonly tombstone_reason: string | null;
					},
					[string]
				>(
					'SELECT uid, source_path, deleted_at, tombstone_reason FROM proposals WHERE uid = ?',
				)
				.get('x00001');
			expect(proposal).toEqual({
				uid: 'x00001',
				source_path: 'ready/refactors/x00001.md',
				deleted_at: null,
				tombstone_reason: null,
			});

			const history = staged.handle
				.query<
					{ readonly from_path: string; readonly to_path: string },
					[string, string]
				>(
					'SELECT from_path, to_path FROM path_history WHERE entity_type = ? AND entity_uid = ?',
				)
				.all('proposal', 'x00001');
			expect(history).toEqual([
				{
					from_path: 'ready/fixes/x00001.md',
					to_path: 'ready/refactors/x00001.md',
				},
			]);

			expect(
				staged.handle
					.query<{ count: number }, [string]>(
						'SELECT COUNT(*) AS count FROM tombstones WHERE entity_uid = ?',
					)
					.get('x00001')?.count,
			).toBe(0);
		} finally {
			staged.close();
		}
	});

	it('tombstones an entity instead of deleting it when it disappears entirely', () => {
		const active = new ProposalsSqliteDriver({ path: databasePath });
		try {
			active.handle
				.prepare(
					`INSERT INTO proposals (
					uid, slug, kind, status, title, source_path, source_blob_sha,
					revision, content_hash, created_at, updated_at, closed_at,
					deleted_at, last_seen_at, last_seen_commit, tombstone_reason
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				)
				.run(
					'x00002',
					'x00002',
					'fix',
					'ready',
					'Two',
					'ready/fixes/x00002.md',
					null,
					0,
					null,
					300,
					300,
					null,
					null,
					null,
					null,
					null,
				);
			active.handle
				.prepare(
					`INSERT INTO reconciliation_runs (
					source_commit, source_tree, reconciler_version, schema_version,
					started_at, completed_at, status, files_seen, files_changed,
					entities_created, entities_updated, entities_deleted,
					entities_quarantined, logical_digest, kind, error
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				)
				.run(
					'first-commit',
					'tree-first',
					'test',
					14,
					300,
					300,
					'ok',
					1,
					1,
					1,
					0,
					0,
					0,
					'digest',
					'shadow',
					null,
				);
		} finally {
			active.close();
		}

		const second = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath,
			statePath,
			sourceCommit: 'second-commit',
			sha: 'tree-second',
			files: [],
			now: 400,
		});

		expect(second.status).toBe('ok');
		const staged = new ProposalsSqliteDriver({
			path: second.stagingPath,
			readonly: true,
		});
		try {
			const proposal = staged.handle
				.query<
					{
						readonly deleted_at: number | null;
						readonly last_seen_at: number | null;
						readonly last_seen_commit: string | null;
						readonly tombstone_reason: string | null;
					},
					[string]
				>(
					`SELECT deleted_at, last_seen_at, last_seen_commit,
							tombstone_reason
					 FROM proposals
					 WHERE uid = ?`,
				)
				.get('x00002');
			expect(proposal).toEqual({
				deleted_at: 400,
				last_seen_at: 300,
				last_seen_commit: 'first-commit',
				tombstone_reason: 'git-removed',
			});

			const tombstone = staged.handle
				.query<
					{
						readonly reason: string;
						readonly deleted_at: number;
						readonly last_seen_commit: string;
					},
					[string, string]
				>(
					`SELECT reason, deleted_at, last_seen_commit
					 FROM tombstones
					 WHERE entity_type = ? AND entity_uid = ?`,
				)
				.get('proposal', 'x00002');
			expect(tombstone).toEqual({
				reason: 'git-removed',
				deleted_at: 400,
				last_seen_commit: 'first-commit',
			});
		} finally {
			staged.close();
		}
	});
});

describe('a moved proposal is counted once (x00599)', () => {
	let root: string;
	let workspacePath: string;
	let statePath: string;
	let databasePath: string;

	beforeEach(() => {
		root = makeRoot();
		workspacePath = join(root, 'workspace');
		const paths = resolveProposalsDbPaths(workspacePath);
		statePath = paths.stateDir;
		databasePath = paths.databasePath;
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const seedOne = (): void => {
		const active = new ProposalsSqliteDriver({ path: databasePath });
		try {
			active.handle
				.prepare(
					`INSERT INTO proposals (
					uid, slug, kind, status, title, source_path, source_blob_sha,
					revision, content_hash, created_at, updated_at, closed_at,
					deleted_at, last_seen_at, last_seen_commit, tombstone_reason
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				)
				.run(
					'x00001',
					'x00001',
					'fix',
					'ready',
					'One',
					'ready/fixes/x00001.md',
					null,
					0,
					null,
					100,
					100,
					null,
					null,
					null,
					null,
					null,
				);
		} finally {
			active.close();
		}
	};

	it('reports the move as one update, and filesChanged counts it once', () => {
		// `relocated` is assigned in reconciler-staging and never read,
		// which reads like a term missing from `filesChanged`. It is not.
		//
		// `countAgainstAuthority` compares a content digest that INCLUDES
		// `source_path`, so a file that moved already differs and is
		// already counted as an update. Adding `relocated` to
		// `filesChanged` would count the same move twice.
		//
		// This test is the evidence for that reading, so the next person
		// to see the unused variable does not "fix" it into a
		// double-count.
		seedOne();

		const run = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath,
			statePath,
			sourceCommit: 'second-commit',
			sha: 'tree-second',
			files: [
				{
					path: 'ready/refactors/x00001.md',
					sha: 'blob-x00001-moved',
					raw: [
						'---',
						'id: x00001',
						'title: "One"',
						'kind: fix',
						'status: ready',
						'type: proposal',
						'track: general',
						'---',
						'',
						'# x00001 — One',
						'',
						'## goal',
						'',
						'Move, and be counted once.',
					].join('\n'),
				},
			],
			now: 200,
		});

		// One file moved, so exactly one entity changed — and the move is
		// reported separately rather than added on top.
		expect(run.relocated).toBe(1);

		const staged = new ProposalsSqliteDriver({
			path: run.stagingPath,
			readonly: true,
		});
		try {
			const row = staged.handle
				.query<
					{
						readonly files_changed: number;
						readonly entities_created: number;
						readonly entities_updated: number;
						readonly entities_deleted: number;
					},
					[]
				>(
					`SELECT files_changed, entities_created, entities_updated,
					        entities_deleted
					 FROM reconciliation_runs ORDER BY id DESC LIMIT 1`,
				)
				.get();
			expect(row).toEqual({
				files_changed: 1,
				entities_created: 0,
				entities_updated: 1,
				entities_deleted: 0,
			});
		} finally {
			staged.close();
		}
	});

	it('reports no relocation when a file changed where it stands', () => {
		// The other half of the breakdown: an edit in place is an update
		// and not a move, so a caller can tell a reorganisation from real
		// work.
		seedOne();

		const run = reconcileShadowToStaging({
			mode: 'shadow',
			workspacePath,
			statePath,
			sourceCommit: 'second-commit',
			sha: 'tree-second',
			files: [
				{
					path: 'ready/fixes/x00001.md',
					sha: 'blob-x00001-edited',
					raw: [
						'---',
						'id: x00001',
						'title: "One, edited"',
						'kind: fix',
						'status: ready',
						'type: proposal',
						'track: general',
						'---',
						'',
						'# x00001 — One, edited',
						'',
						'## goal',
						'',
						'Change in place.',
					].join('\n'),
				},
			],
			now: 200,
		});

		expect(run.relocated).toBe(0);
	});
});
