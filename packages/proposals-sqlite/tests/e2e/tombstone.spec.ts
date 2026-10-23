import { renameSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	ProposalsSqliteDriver,
	reconcileShadowToStaging,
	resolveProposalsDbPaths,
} from '../../src';
import { resurrectEntity } from '../../../../plugins/proposals/src/lib/services/resurrect';

const makeRoot = (): string =>
	mkdtempSync(join(tmpdir(), 'proposals-sqlite-tombstones-e2e-'));

const proposal = (uid: string, path: string) => ({
	path,
	sha: `blob-${uid}`,
	raw: `---\nid: ${uid}\ntitle: Fixture ${uid}\nkind: fix\nstatus: ready\ntype: proposal\ntrack: architecture\n---\n# Fixture ${uid}\n`,
});

const reconcile = (input: {
	readonly root: string;
	readonly sourceCommit: string;
	readonly sha: string;
	readonly files: readonly ReturnType<typeof proposal>[];
	readonly now: number;
}): string => {
	const paths = resolveProposalsDbPaths(input.root);
	const result = reconcileShadowToStaging({
		mode: 'shadow',
		workspacePath: input.root,
		statePath: paths.stateDir,
		sourceCommit: input.sourceCommit,
		sha: input.sha,
		files: input.files,
		now: input.now,
	});
	renameSync(result.stagingPath, paths.databasePath);
	return paths.databasePath;
};

describe('tombstone e2e regression (f00519 S3)', () => {
	const roots: string[] = [];

	afterEach(() => {
		for (const root of roots.splice(0)) {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('preserves uid and records path history when a proposal moves', () => {
		const root = makeRoot();
		roots.push(root);

		reconcile({
			root,
			sourceCommit: 'commit-original',
			sha: 'tree-original',
			files: [proposal('x00510', 'ready/fixes/x00510-fixture.md')],
			now: 100,
		});
		const moved = reconcile({
			root,
			sourceCommit: 'commit-moved',
			sha: 'tree-moved',
			files: [proposal('x00510', 'ready/refactors/x00510-fixture.md')],
			now: 200,
		});

		const driver = new ProposalsSqliteDriver({
			path: moved,
			readonly: true,
		});
		try {
			expect(
				driver.handle
					.query<
						{
							uid: string;
							source_path: string;
							deleted_at: number | null;
						},
						[]
					>('SELECT uid, source_path, deleted_at FROM proposals')
					.all(),
			).toEqual([
				{
					uid: 'x00510',
					source_path: 'ready/refactors/x00510-fixture.md',
					deleted_at: null,
				},
			]);
			expect(
				driver.handle
					.query<{ from_path: string; to_path: string }, []>(
						'SELECT from_path, to_path FROM path_history',
					)
					.all(),
			).toEqual([
				{
					from_path: 'ready/fixes/x00510-fixture.md',
					to_path: 'ready/refactors/x00510-fixture.md',
				},
			]);
		} finally {
			driver.close();
		}
	});

	it('tombstones a renamed proposal after it disappears instead of deleting it', () => {
		const root = makeRoot();
		roots.push(root);

		reconcile({
			root,
			sourceCommit: 'commit-original',
			sha: 'tree-original',
			files: [proposal('x00511', 'ready/fixes/x00511-fixture.md')],
			now: 100,
		});
		reconcile({
			root,
			sourceCommit: 'commit-moved',
			sha: 'tree-moved',
			files: [proposal('x00511', 'ready/refactors/x00511-fixture.md')],
			now: 200,
		});
		const tombstoned = reconcile({
			root,
			sourceCommit: 'commit-removed',
			sha: 'tree-removed',
			files: [],
			now: 300,
		});

		const driver = new ProposalsSqliteDriver({
			path: tombstoned,
			readonly: true,
		});
		try {
			expect(
				driver.handle
					.query<
						{
							uid: string;
							deleted_at: number;
							tombstone_reason: string;
						},
						[]
					>('SELECT uid, deleted_at, tombstone_reason FROM proposals')
					.all(),
			).toEqual([
				{
					uid: 'x00511',
					deleted_at: 300,
					tombstone_reason: 'git-removed',
				},
			]);
			expect(
				driver.handle
					.query<{ count: number }, []>(
						'SELECT COUNT(*) AS count FROM proposals',
					)
					.get()?.count,
			).toBe(1);
		} finally {
			driver.close();
		}
	});

	it('resurrects only the requested tombstone and appends one lifecycle event', () => {
		const root = makeRoot();
		roots.push(root);

		reconcile({
			root,
			sourceCommit: 'commit-seeded',
			sha: 'tree-seeded',
			files: [
				proposal('x00512', 'ready/fixes/x00512-fixture.md'),
				proposal('x00513', 'ready/fixes/x00513-fixture.md'),
			],
			now: 100,
		});
		const tombstoned = reconcile({
			root,
			sourceCommit: 'commit-removed',
			sha: 'tree-removed',
			files: [],
			now: 200,
		});

		const resurrected = resurrectEntity({
			workspaceRoot: root,
			uid: 'x00512',
			note: 'fixture restored',
			now: 300,
		});
		expect(resurrected.uid).toBe('x00512');
		expect(resurrected.lifecycleEventId).toBeGreaterThan(0);

		const driver = new ProposalsSqliteDriver({
			path: tombstoned,
			readonly: true,
		});
		try {
			expect(
				driver.handle
					.query<{ uid: string; deleted_at: number | null }, []>(
						'SELECT uid, deleted_at FROM proposals ORDER BY uid',
					)
					.all(),
			).toEqual([
				{ uid: 'x00512', deleted_at: null },
				{ uid: 'x00513', deleted_at: 200 },
			]);
			expect(
				driver.handle
					.query<
						{
							entity_uid: string;
							to_status: string;
							metadata: string;
						},
						[]
					>(
						`SELECT entity_uid, to_status, metadata
						 FROM lifecycle_events
						 WHERE to_status = 'entity_resurrected'`,
					)
					.all(),
			).toEqual([
				{
					entity_uid: 'x00512',
					to_status: 'entity_resurrected',
					metadata: JSON.stringify({ note: 'fixture restored' }),
				},
			]);
		} finally {
			driver.close();
		}
	});
});
