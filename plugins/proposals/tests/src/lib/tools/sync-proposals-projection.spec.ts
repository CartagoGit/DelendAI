/**
 * sync-proposals-projection.spec.ts — the OTHER projection follows the
 * same rebuild.
 *
 * The registry at `<cacheDir>/proposals/index.json` and
 * `proposals.sqlite` are two views of one markdown tree, and only the
 * registry was ever rebuilt. They disagreed more with every proposal
 * written, and the reader fell back to the registry for good — so the
 * shadow could never reach parity and "prefer SQLite" never applied.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	runSyncProposals,
	type ISyncProposalsToolOptions,
} from '@delendai/proposals/lib/tools/sync-proposals.tool';
import type { IDbReconcileOutput } from '@delendai/proposals/lib/tools/db-reconcile.tool';
import type { IGitRunner } from '@delendai/proposals/lib/shared/git-runner';

const PROPOSALS_DIR = 'docs/delendai/proposals';
const INDEX_FILE = '.cache/delendai/proposals/index.json';

/** git is never reached: nothing here moves a file between folders. */
const NO_GIT: IGitRunner = async () => ({ ok: true, output: '' });

const writeProposal = async (
	root: string,
	relPath: string,
	frontmatter: Record<string, string>,
): Promise<void> => {
	const abs = join(root, PROPOSALS_DIR, relPath);
	await mkdir(join(abs, '..'), { recursive: true });
	const lines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`);
	await writeFile(
		abs,
		`---\n${lines.join('\n')}\n---\n\n## Goal\n\nfixture\n`,
		'utf8',
	);
};

const makeOptions = (root: string): ISyncProposalsToolOptions => ({
	namespacePrefix: 'proposals',
	workspaceRoot: root,
	layout: { proposalsDir: PROPOSALS_DIR, proposalIndexFile: INDEX_FILE },
	gitRunner: NO_GIT,
});

/** What a successful reconcile of one proposal looks like. */
const RECONCILED: IDbReconcileOutput = {
	status: 'ok',
	created: false,
	dryRun: false,
	databasePath: 'db',
	stagingPath: 'db.staging',
	statePath: 's',
	sourceCommit: 'abc123def',
	logicalDigest: null,
	filesScanned: 1,
	filesReconciled: 1,
	proposals: 1,
	plans: 0,
	slices: 0,
	staged: { proposals: 1, plans: 0, slices: 0 },
	excluded: [],
	excludedCount: 0,
	integrity: 'ok',
	foreignKey: 'ok',
	reason: null,
	startedAt: 0,
	durationMs: 1,
};

describe('the other projection follows the same rebuild (x00601)', () => {
	const workspace = async (): Promise<string> => {
		const root = await mkdtemp(join(tmpdir(), 'sync-projection-'));
		await writeProposal(root, 'ready/fixes/x00001-one.md', {
			id: 'x00001',
			title: '"One"',
			kind: 'fix',
			status: 'ready',
			type: 'proposal',
			track: 'general',
			date: '2026-09-22',
		});
		return root;
	};

	it('reconciles when the registry changed', async () => {
		// The registry and the database are two views of one tree, and
		// only the registry was ever rebuilt. So they disagreed more with
		// every proposal written, and the reader fell back for good.
		const root = await workspace();
		const reconciled: unknown[] = [];
		const payload = await runSyncProposals({
			...makeOptions(root),
			reconcile: (input) => {
				reconciled.push(input);
				return RECONCILED;
			},
		});
		expect(payload.changed).toBe(true);
		expect(payload.projection).toBe('refreshed');
		expect(reconciled).toHaveLength(1);
		await rm(root, { recursive: true, force: true });
	});

	it('skips when the tree did not change, because the projection is already level', async () => {
		// A second full scan for nothing is not free: the first one takes
		// well over a second on a real tree.
		const root = await workspace();
		await runSyncProposals(makeOptions(root));
		const calls: unknown[] = [];
		const payload = await runSyncProposals({
			...makeOptions(root),
			reconcile: (input) => {
				calls.push(input);
				throw new Error('must not be called');
			},
		});
		expect(payload.changed).toBe(false);
		expect(payload.projection).toBe('skipped');
		expect(calls).toHaveLength(0);
		await rm(root, { recursive: true, force: true });
	});

	it('skips when the caller turned it off', async () => {
		const root = await workspace();
		const payload = await runSyncProposals({
			...makeOptions(root),
			refreshProjection: false,
			reconcile: () => {
				throw new Error('must not be called');
			},
		});
		expect(payload.changed).toBe(true);
		expect(payload.projection).toBe('skipped');
		await rm(root, { recursive: true, force: true });
	});

	it('reports a reconcile that failed, and the registry still stands', async () => {
		// A database that could not be reconciled is a stale cache, not a
		// lost proposal: the reader falls back to the registry, which is
		// written first and correct on its own.
		const root = await workspace();
		const payload = await runSyncProposals({
			...makeOptions(root),
			reconcile: () => {
				throw new Error('database is locked');
			},
		});
		expect(payload.projection).toBe('failed');
		expect(payload.indexPath.length).toBeGreaterThan(0);
		expect(payload.count).toBeGreaterThan(0);
		await rm(root, { recursive: true, force: true });
	});
});
