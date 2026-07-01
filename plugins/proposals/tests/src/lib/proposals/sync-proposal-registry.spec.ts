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

import { syncProposalRegistry } from '@mcp-vertex/proposals/lib/proposals/sync-proposal-registry';
import { DEFAULT_PATH_LAYOUT } from '@mcp-vertex/proposals/lib/contracts/constants/default-path-layout.constant';
import type { IGitRunner } from '@mcp-vertex/proposals/lib/shared/git-runner';

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

const readIndex = async (
	root: string,
): Promise<{ proposals: Array<{ id: string; status: string }> }> => {
	const indexPath = resolve(root, DEFAULT_PATH_LAYOUT.proposalIndexFile);
	return JSON.parse(await readFile(indexPath, 'utf8')) as {
		proposals: Array<{ id: string; status: string }>;
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
});
