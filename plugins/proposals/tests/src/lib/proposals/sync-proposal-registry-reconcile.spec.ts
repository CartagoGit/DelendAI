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
	});

	describe('reconcileBlocked', () => {
		// `blocked_by` is a YAML block array — frontmatter-parser.ts only
		// supports inline arrays when they're empty (`key: []`); a non-empty
		// inline array like `key: [f400]` parses as the literal string
		// "[f400]", not an array. Written by hand here, bypassing the
		// generic flat-map writeProposal() helper.
		const writeWithBlockedBy = async (
			folder: string,
			filename: string,
			id: string,
			blockedByTokens: readonly string[],
			body = '## Goal\n\np.\n',
		): Promise<void> => {
			const dir = join(root, folder);
			await mkdir(dir, { recursive: true });
			const blockLines = blockedByTokens
				.map((t) => `  - ${t}`)
				.join('\n');
			const raw = `---\nid: ${id}\nstatus: blocked\nblocked_by:\n${blockLines}\n---\n\n${body}`;
			await writeFile(join(dir, filename), raw, 'utf8');
		};

		it('resolves blocked -> ready when the dependency is done', async () => {
			await writeProposal(root, 'done', 'f400-dep.md', {
				id: 'f400',
				status: 'done',
			});
			await writeWithBlockedBy('blocked', 'f401-waiting.md', 'f401', [
				'f400',
			]);
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
			await writeWithBlockedBy('blocked', 'f403-waiting.md', 'f403', [
				'f402',
			]);
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
			const dir = join(root, 'blocked');
			await mkdir(dir, { recursive: true });
			const raw = `---
id: f404
kind: feat
title: A sufficiently long title
status: blocked
date: 2026-06-20
track: proposals
blocked_by:
  - self:goal-missing
---

${validBody}`;
			await writeFile(join(dir, 'f404-self-blocked.md'), raw, 'utf8');
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
	});
});
