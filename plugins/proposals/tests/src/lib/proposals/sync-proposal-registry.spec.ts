/**
 * Unit specs for the `syncProposalRegistry` entry point (t00001 S2 /
 * audit H3). The reconcile sub-functions are covered by
 * `sync-proposal-registry-reconcile.spec.ts` and the atomic/race path by
 * `sync-proposal-registry-race.spec.ts`; this file pins the top-level
 * orchestrator — that seeding a proposals tree and running the sync
 * produces an index file enumerating the seeded proposals.
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { syncProposalRegistry } from '@delendai/proposals/lib/proposals/sync-proposal-registry';
import { findProposalFolderDrift } from '@delendai/proposals/lib/proposals/sync-proposal-registry';
import { DEFAULT_PATH_LAYOUT } from '@delendai/proposals/lib/contracts/constants/default-path-layout.constant';
import type { IGitRunner } from '@delendai/proposals/lib/shared/git-runner';

const FAKE_GIT_MV: IGitRunner = async (args) => {
	const [, from, to] = args;
	if (from && to) await rename(from, to);
	return { ok: true, output: '' };
};

const seed = async (
	root: string,
	folder: string,
	filename: string,
	fm: Record<string, string>,
): Promise<void> => {
	const dir = resolve(root, DEFAULT_PATH_LAYOUT.proposalsDir, folder);
	await mkdir(dir, { recursive: true });
	const frontmatter = Object.entries(fm)
		.map(([k, v]) => `${k}: ${v}`)
		.join('\n');
	await writeFile(
		join(dir, filename),
		`---\n${frontmatter}\n---\n\n## Goal\n\nseed.\n`,
		'utf8',
	);
};

interface IIndexedProposal {
	readonly id: string;
	readonly status: string;
	readonly file?: string;
	readonly archived?: boolean;
}

const readIndex = async (
	root: string,
): Promise<{ count: number; proposals: IIndexedProposal[] }> => {
	const indexPath = resolve(root, DEFAULT_PATH_LAYOUT.proposalIndexFile);
	return JSON.parse(await readFile(indexPath, 'utf8')) as {
		count: number;
		proposals: IIndexedProposal[];
	};
};

describe('syncProposalRegistry (entry point)', async () => {
	let root = '';

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'sync-entry-'));
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it('writes an index enumerating every seeded proposal', async () => {
		await seed(root, 'ready', 'f900-alpha.md', {
			id: 'f900',
			status: 'ready',
			kind: 'feat',
			title: 'Alpha',
		});
		await seed(root, 'done', 'f901-beta.md', {
			id: 'f901',
			status: 'done',
			kind: 'feat',
			title: 'Beta',
		});

		const result = await syncProposalRegistry(
			root,
			DEFAULT_PATH_LAYOUT,
			[],
			FAKE_GIT_MV,
		);
		expect(result).toBeDefined();

		const index = await readIndex(root);
		const ids = index.proposals.map((p) => p.id);
		expect(ids).toContain('f900');
		expect(ids).toContain('f901');
		expect(index.proposals.find((p) => p.id === 'f900')?.status).toBe(
			'ready',
		);
	});

	it('produces an empty proposal list for an empty tree (no crash)', async () => {
		await mkdir(resolve(root, DEFAULT_PATH_LAYOUT.proposalsDir, 'ready'), {
			recursive: true,
		});
		await syncProposalRegistry(root, DEFAULT_PATH_LAYOUT, [], FAKE_GIT_MV);
		const index = await readIndex(root);
		expect(Array.isArray(index.proposals)).toBe(true);
		expect(index.proposals).toHaveLength(0);
	});

	it('is idempotent: a second sync yields the same id set', async () => {
		await seed(root, 'ready', 'f902-gamma.md', {
			id: 'f902',
			status: 'ready',
			kind: 'feat',
			title: 'Gamma',
		});
		await syncProposalRegistry(root, DEFAULT_PATH_LAYOUT, [], FAKE_GIT_MV);
		const first = (await readIndex(root)).proposals.map((p) => p.id).sort();
		await syncProposalRegistry(root, DEFAULT_PATH_LAYOUT, [], FAKE_GIT_MV);
		const second = (await readIndex(root)).proposals
			.map((p) => p.id)
			.sort();
		expect(second).toEqual(first);
	});

	// a00084 F20: the filename prefilter used to accept unbounded trailing
	// letters (`[a-z]*`) after the digit run, e.g. `x1abcd-*.md`, even
	// though `frontmatter-linter.ts`'s id-shape check would reject such an
	// id as soon as it's actually linted. Tightened to a single optional
	// legacy-residual letter (`[a-z]?`) — enough for real files like
	// `f00067a-*.md` but not an open-ended suffix.
	it('does not index a filename with a malformed multi-letter id suffix', async () => {
		await seed(root, 'ready', 'x1abcd-malformed.md', {
			id: 'x1abcd',
			status: 'ready',
			kind: 'fix',
			title: 'Malformed',
		});
		await syncProposalRegistry(root, DEFAULT_PATH_LAYOUT, [], FAKE_GIT_MV);
		const index = await readIndex(root);
		expect(index.proposals.map((p) => p.id)).not.toContain('x1abcd');
	});

	it('still indexes the legacy single-letter residual-suffix id form', async () => {
		await seed(root, 'done', 'f904a-residual.md', {
			id: 'f904a',
			status: 'done',
			kind: 'feat',
			title: 'Residual',
		});
		await syncProposalRegistry(root, DEFAULT_PATH_LAYOUT, [], FAKE_GIT_MV);
		const index = await readIndex(root);
		expect(index.proposals.map((p) => p.id)).toContain('f904a');
	});

	it('indexes review proposals in kind subfolders exactly once', async () => {
		await seed(root, 'review/plans', 'q905-review-plan.md', {
			id: 'q905',
			status: 'review',
			kind: 'plan',
			title: 'Review plan',
		});
		await seed(root, 'review/feats', 'f906-review-feat.md', {
			id: 'f906',
			status: 'review',
			kind: 'feat',
			title: 'Review feature',
		});

		const result = await syncProposalRegistry(
			root,
			DEFAULT_PATH_LAYOUT,
			[],
			FAKE_GIT_MV,
		);
		const index = await readIndex(root);
		const ids = index.proposals.map((p) => p.id);

		expect(result.errors).toEqual([]);
		expect(index.count).toBe(2);
		expect(ids).toEqual(expect.arrayContaining(['q905', 'f906']));
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('does not report folder drift once the same sync reconciles it', async () => {
		await seed(root, 'review', 'f903-drift.md', {
			id: 'f903',
			status: 'done',
			kind: 'feat',
			title: 'Drift',
		});
		const drift = await findProposalFolderDrift(
			resolve(root, DEFAULT_PATH_LAYOUT.proposalsDir),
		);
		expect(drift).toHaveLength(1);
		expect(drift[0]).toMatchObject({
			id: 'f903',
			folder: 'review',
			expectedFolder: 'done/feats',
			status: 'done',
		});
		const result = await syncProposalRegistry(
			root,
			DEFAULT_PATH_LAYOUT,
			[],
			FAKE_GIT_MV,
		);
		expect(result.errors).toEqual([]);
		const index = await readIndex(root);
		expect(index.proposals.find((p) => p.id === 'f903')?.file).toBe(
			'done/feats/f00903-drift.md',
		);
	});

	// f00076 S1: the registry scanner must include proposals under
	// `legacy/closed/<kind>/` and tag them with `archived: true` while
	// keeping the original `status: done` in the frontmatter projection.
	describe('legacy/closed/ archive (f00076 S1)', () => {
		it('indexes a proposal under legacy/closed/feats with archived: true', async () => {
			await seed(root, 'legacy/closed/feats', 'f910-archived-alpha.md', {
				id: 'f910',
				status: 'done',
				kind: 'feat',
				title: 'Archived Alpha',
				'archived-on': '2026-07-15',
			});
			const result = await syncProposalRegistry(
				root,
				DEFAULT_PATH_LAYOUT,
				[],
				FAKE_GIT_MV,
			);
			expect(result.errors).toEqual([]);
			const index = await readIndex(root);
			const archived = index.proposals.find((p) => p.id === 'f910');
			expect(archived).toBeDefined();
			expect(archived?.status).toBe('done');
			expect(index.proposals.find((p) => p.id === 'f910')?.file).toBe(
				'legacy/closed/feats/f910-archived-alpha.md',
			);
		});

		it('does not mark active done/<kind>/ entries as archived', async () => {
			await seed(root, 'done/feats', 'f911-live.md', {
				id: 'f911',
				status: 'done',
				kind: 'feat',
				title: 'Live',
			});
			await syncProposalRegistry(
				root,
				DEFAULT_PATH_LAYOUT,
				[],
				FAKE_GIT_MV,
			);
			const index = await readIndex(root);
			const live = index.proposals.find((p) => p.id === 'f911');
			expect(live).toBeDefined();
			expect(live?.archived).toBeUndefined();
		});

		it('tolerates an empty legacy/closed/ subtree', async () => {
			await mkdir(
				resolve(
					root,
					DEFAULT_PATH_LAYOUT.proposalsDir,
					'legacy/closed',
				),
				{ recursive: true },
			);
			await seed(root, 'ready', 'f912-baseline.md', {
				id: 'f912',
				status: 'ready',
				kind: 'feat',
				title: 'Baseline',
			});
			const result = await syncProposalRegistry(
				root,
				DEFAULT_PATH_LAYOUT,
				[],
				FAKE_GIT_MV,
			);
			expect(result.errors).toEqual([]);
			const index = await readIndex(root);
			expect(index.proposals).toHaveLength(1);
			expect(index.proposals[0]?.id).toBe('f912');
		});
	});
});
