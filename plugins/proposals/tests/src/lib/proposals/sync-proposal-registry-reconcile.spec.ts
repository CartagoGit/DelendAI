import {
	mkdir,
	mkdtemp,
	readFile,
	rename,
	rm,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	reconcileBlocked,
	reconcileFolders,
	syncProposalRegistry,
} from '@mcp-vertex/proposals/lib/proposals/sync-proposal-registry';
import type { IGitRunner } from '@mcp-vertex/proposals/lib/shared/git-runner';

// Real `git mv` moves the file; the fake must too (same reasoning as the
// proposal-transition.tool.spec.ts fake).
const FAKE_GIT_MV: IGitRunner = async (args) => {
	const [, from, to] = args;
	if (from && to) await rename(from, to);
	return { ok: true, output: '' };
};

const writeProposal = async (
	proposalsDirAbs: string,
	folder: string,
	filename: string,
	frontmatter: Record<string, string>,
	body = '## Goal\n\np.\n',
): Promise<void> => {
	const dir = folder === '' ? proposalsDirAbs : join(proposalsDirAbs, folder);
	await mkdir(dir, { recursive: true });
	const lines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`);
	await writeFile(
		join(dir, filename),
		`---\n${lines.join('\n')}\n---\n\n${body}`,
		'utf8',
	);
};

describe('sync-proposal-registry reconciliation (f113 S5)', () => {
	let root = '';

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'reconcile-'));
	});

	afterEach(async () => rm(root, { recursive: true, force: true }));

	describe('reconcileFolders', () => {
		it('moves a new-system file whose folder disagrees with its status', async () => {
			await writeProposal(root, 'blocked', 'f300-misfiled.md', {
				id: 'f300',
				status: 'ready',
			});
			const result = await reconcileFolders(root, FAKE_GIT_MV);
			expect(result.moved).toEqual([
				{ id: 'f300', from: 'blocked', to: 'ready' },
			]);
			const moved = await readFile(
				join(root, 'ready', 'f300-misfiled.md'),
				'utf8',
			);
			expect(moved).toContain('status: ready');
		});

		it('is idempotent: a file already correctly placed is left alone', async () => {
			await writeProposal(root, 'ready', 'f301-fine.md', {
				id: 'f301',
				status: 'ready',
			});
			const first = await reconcileFolders(root, FAKE_GIT_MV);
			const second = await reconcileFolders(root, FAKE_GIT_MV);
			expect(first.moved).toEqual([]);
			expect(second.moved).toEqual([]);
		});

		it('never touches a legacy (old 8-status union) proposal', async () => {
			await writeProposal(root, '', 'p050-legacy.md', {
				id: 'p050',
				status: 'pending',
			});
			const result = await reconcileFolders(root, FAKE_GIT_MV);
			expect(result.moved).toEqual([]);
			// still at the root, untouched
			await readFile(join(root, 'p050-legacy.md'), 'utf8');
		});

		// Regression: `status` alone isn't a safe signal — `ready` is the
		// *default* status create_proposal writes for ANY new proposal
		// regardless of kind (authoring.tool.ts: `status: ${args.status ??
		// 'ready'}`). Without also gating on the filename prefix, a brand
		// new legacy-style proposal (id `p5`, `l100`, …) created via the
		// existing, heavily-used create_proposal tool would get silently
		// relocated into `ready/` the moment syncProposalRegistry next ran
		// — caught by authoring.spec.ts's "p5-meta.md stays exactly where
		// it was written" assertion.
		it('never touches a legacy-prefixed file even when its status happens to be a glossary status (ready)', async () => {
			await writeProposal(root, '', 'p005-newly-created.md', {
				id: 'p005',
				status: 'ready',
			});
			const result = await reconcileFolders(root, FAKE_GIT_MV);
			expect(result.moved).toEqual([]);
			await readFile(join(root, 'p005-newly-created.md'), 'utf8');
		});
	});

	describe('reconcileBlocked', () => {
		it('resolves blocked -> ready when the dependency is done', async () => {
			await writeProposal(root, 'done', 'f400-dep.md', {
				id: 'f400',
				status: 'done',
			});
			await writeProposal(root, 'blocked', 'f401-waiting.md', {
				id: 'f401',
				status: 'blocked',
				blocked_by: '[f400]',
			});
			const result = await reconcileBlocked(root, FAKE_GIT_MV);
			expect(result.resolved).toEqual([{ id: 'f401' }]);
			const moved = await readFile(
				join(root, 'ready', 'f401-waiting.md'),
				'utf8',
			);
			expect(moved).toContain('status: ready');
		});

		it('stays blocked when the dependency is not done', async () => {
			await writeProposal(root, 'ready', 'f402-dep.md', {
				id: 'f402',
				status: 'ready',
			});
			await writeProposal(root, 'blocked', 'f403-waiting.md', {
				id: 'f403',
				status: 'blocked',
				blocked_by: '[f402]',
			});
			const result = await reconcileBlocked(root, FAKE_GIT_MV);
			expect(result.resolved).toEqual([]);
		});

		it('resolves a self-block once the scaffold linter passes', async () => {
			const validBody = [
				'## Goal',
				'',
				'p.',
				'',
				'## Why',
				'',
				'p.',
				'',
				'## Non-goals',
				'',
				'- x',
				'',
				'## Slices',
				'',
				'### S1 — Do the thing',
				'- **Status**: pending',
				'- **Files**: [`a.ts`]',
				'- **Command**: `bun run test`',
				'- **Expect**: exit0',
				'',
				'## Acceptance',
				'',
				'- [ ] done.',
				'',
			].join('\n');
			await writeProposal(
				root,
				'blocked',
				'f404-self-blocked.md',
				{
					id: 'f404',
					kind: 'feat',
					title: 'A sufficiently long title',
					status: 'blocked',
					date: '2026-06-20',
					track: 'proposals',
					blocked_by: '[self:goal-missing]',
				},
				validBody,
			);
			const result = await reconcileBlocked(root, FAKE_GIT_MV);
			expect(result.resolved).toEqual([{ id: 'f404' }]);
		});
	});

	describe('syncProposalRegistry integration', () => {
		it('discovers a new-system proposal living in ready/', async () => {
			await writeProposal(root, 'ready', 'f500-discoverable.md', {
				id: 'f500',
				status: 'ready',
				track: 'proposals',
				date: '2026-06-20',
			});
			const result = await syncProposalRegistry(
				root,
				{ proposalsDir: '.', proposalIndexFile: 'index.json' },
				[],
				FAKE_GIT_MV,
			);
			expect(result.proposals.some((p) => p.id === 'f500')).toBe(true);
		});

		it('reconciles a misfiled proposal before building the index (no duplicate entries)', async () => {
			await writeProposal(root, 'blocked', 'f501-misfiled.md', {
				id: 'f501',
				status: 'ready',
				track: 'proposals',
				date: '2026-06-20',
			});
			const result = await syncProposalRegistry(
				root,
				{ proposalsDir: '.', proposalIndexFile: 'index.json' },
				[],
				FAKE_GIT_MV,
			);
			const matches = result.proposals.filter((p) => p.id === 'f501');
			expect(matches).toHaveLength(1);
			expect(matches[0]?.file).toBe('ready/f501-misfiled.md');
		});

		// n007 (resume kind): proposals living in kind sub-folders inside
		// `done/` (`done/resumes/`, `done/audits/`, `done/feats/`,
		// `done/fixes/`) must show up in the index exactly once, never
		// duplicated by `done/` itself or any other subtree. Before n007,
		// syncProposalRegistry only listed top-level status folders, so
		// `done/resumes/*.md` were invisible to the registry — the linter
		// walked them, but `proposal_board` / `auto_work` couldn't see
		// them. The fix: add explicit sub-tree entries for the 4 known
		// kind buckets under `done/` so each is scanned once and only once.
		it('discovers a proposal in done/resumes/ exactly once (n007 resume kind)', async () => {
			await writeProposal(root, 'done/resumes', 'n001-handoff.md', {
				id: 'n001',
				kind: 'resume',
				status: 'done',
				track: 'general',
				date: '2026-06-21',
			});
			const result = await syncProposalRegistry(
				root,
				{ proposalsDir: '.', proposalIndexFile: 'index.json' },
				[],
				FAKE_GIT_MV,
			);
			const matches = result.proposals.filter((p) => p.id === 'n001');
			expect(matches).toHaveLength(1);
			expect(matches[0]?.file).toBe('done/resumes/n001-handoff.md');
			expect(matches[0]?.status).toBe('done');
		});

		it('discovers all 4 f119 kind sub-folders under done/ exactly once', async () => {
			await writeProposal(root, 'done/audits', 'a900-test.md', {
				id: 'a900',
				status: 'done',
				track: 'audit',
				date: '2026-06-21',
			});
			await writeProposal(root, 'done/feats', 'f901-test.md', {
				id: 'f901',
				status: 'done',
				track: 'proposals',
				date: '2026-06-21',
			});
			await writeProposal(root, 'done/fixes', 'x901-test.md', {
				id: 'x901',
				status: 'done',
				track: 'proposals',
				date: '2026-06-21',
			});
			await writeProposal(root, 'done/resumes', 'n902-test.md', {
				id: 'n902',
				status: 'done',
				track: 'general',
				date: '2026-06-21',
			});
			const result = await syncProposalRegistry(
				root,
				{ proposalsDir: '.', proposalIndexFile: 'index.json' },
				[],
				FAKE_GIT_MV,
			);
			for (const id of ['a900', 'f901', 'x901', 'n902']) {
				const matches = result.proposals.filter((p) => p.id === id);
				expect(matches, `${id} must appear exactly once`).toHaveLength(
					1,
				);
			}
		});
	});
});
