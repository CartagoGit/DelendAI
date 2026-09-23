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
	buildSyncProposalsRegistration,
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

	it('skips when the projection is already level with the registry', async () => {
		// A full reconcile costs seconds whether or not anything changed,
		// so the refresh asks the reader's own parity question first. The
		// real database answering "level" is proven under bun, in
		// services/projection-parity.spec.ts; here the verdict is given.
		const root = await workspace();
		const calls: unknown[] = [];
		const payload = await runSyncProposals({
			...makeOptions(root),
			parity: async () => 'parity',
			reconcile: (input) => {
				calls.push(input);
				throw new Error('must not be called');
			},
		});
		expect(payload.projection).toBe('skipped');
		expect(calls).toHaveLength(0);
		await rm(root, { recursive: true, force: true });
	});

	it('refreshes whenever the reader would not serve the projection', async () => {
		// Every verdict other than parity is a case where the reader falls
		// back, so every one of them is a case the writer must refresh.
		for (const verdict of [
			'divergence',
			'unavailable',
			'metadata-missing',
		] as const) {
			const root = await workspace();
			const calls: unknown[] = [];
			const payload = await runSyncProposals({
				...makeOptions(root),
				parity: async () => verdict,
				reconcile: (input) => {
					calls.push(input);
					return RECONCILED;
				},
			});
			expect(payload.projection).toBe('refreshed');
			expect(calls).toHaveLength(1);
			await rm(root, { recursive: true, force: true });
		}
	});

	it('refreshes when the parity question itself cannot be answered', async () => {
		// Not knowing is not "level".
		const root = await workspace();
		const calls: unknown[] = [];
		const payload = await runSyncProposals({
			...makeOptions(root),
			parity: async () => {
				throw new Error('cannot open the database');
			},
			reconcile: (input) => {
				calls.push(input);
				return RECONCILED;
			},
		});
		expect(payload.projection).toBe('refreshed');
		expect(calls).toHaveLength(1);
		await rm(root, { recursive: true, force: true });
	});

	it('does not call a rejected reconcile a refresh', async () => {
		// The reconciler can run and refuse to promote. That used to be
		// reported as `refreshed`, announcing as level a projection the
		// reader would go on rejecting.
		const root = await workspace();
		const payload = await runSyncProposals({
			...makeOptions(root),
			reconcile: () => ({
				...RECONCILED,
				status: 'rejected',
				reason: 'integrity_check failed on the staging database',
			}),
		});
		expect(payload.projection).toBe('failed');
		await rm(root, { recursive: true, force: true });
	});

	it('refreshes a database that was never built, even when the registry did not change', async () => {
		// The hole the old rule left. "Refresh when the registry changed"
		// never fires for a project whose index is already current — one
		// upgraded from a version that never built the database, or one
		// whose first refresh failed — so the reader fell back for good.
		const root = await workspace();
		await runSyncProposals({
			...makeOptions(root),
			reconcile: () => {
				throw new Error('database is locked');
			},
		});
		const calls: unknown[] = [];
		const payload = await runSyncProposals({
			...makeOptions(root),
			reconcile: (input) => {
				calls.push(input);
				return RECONCILED;
			},
		});
		expect(payload.changed).toBe(false);
		expect(payload.projection).toBe('refreshed');
		expect(calls).toHaveLength(1);
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

describe('reconciling is not a preference (x00601)', () => {
	it('has no opt-out, because the projection it depends on is not optional', () => {
		// There WAS an option. It was declared in the plugin's schema,
		// documented as a way to keep the database frozen, and never wired
		// — a setting that did nothing, which is worse than no setting.
		//
		// Wiring it was the first fix. Removing it is the right one:
		// nobody asked for it, and reconciling the projection the reader
		// prefers is not a taste. A project that wants a frozen database
		// simply does not call this tool.
		const registration = buildSyncProposalsRegistration({
			namespacePrefix: 'proposals',
			workspaceRoot: '/repo',
			layout: {
				proposalsDir: PROPOSALS_DIR,
				proposalIndexFile: INDEX_FILE,
			},
		});
		expect(registration.id).toBe('sync_proposals');
		expect(registration.effects).toContain('write');
	});
});
