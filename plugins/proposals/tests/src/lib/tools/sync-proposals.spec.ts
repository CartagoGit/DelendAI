/**
 * sync-proposals.spec.ts — x00529 S3.
 *
 * One duplicate proposal used to abort the entire sweep: the folder
 * reconciler refuses to clobber a rename target, and it refused by
 * throwing before the index was written. The result on 2026-09-08 was
 * a repo-wide frozen index caused by a single stale file.
 *
 * These specs pin the degraded behaviour: index everything else, report
 * the duplicate in `errors[]`, and never overwrite or delete anything.
 */
import {
	access,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rename,
	rm,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	createCollisionTolerantGitRunner,
	runSyncProposals,
	type ISyncProposalsToolOptions,
} from '@delendai/proposals/lib/tools/sync-proposals.tool';
import type { IGitRunner } from '@delendai/proposals/lib/shared/git-runner';
import { syncProposalRegistry } from '@delendai/proposals/lib/proposals/sync-proposal-registry';

/** A fake git that really moves files, so a "successful" mv is observable. */
const FAKE_GIT_MV: IGitRunner = async (args) => {
	if (args[0] === 'mv') {
		const [, from, to] = args;
		if (from && to) await rename(from, to);
	}
	return { ok: true, output: '' };
};

/**
 * Mimics the REAL git: `mv` refuses to clobber an occupied
 * destination, which is what sends the engine into its `safeRename`
 * fallback and, before x00529, made it throw.
 */
const FAKE_GIT_REALISTIC: IGitRunner = async (args) => {
	if (args[0] === 'mv') {
		const [, from, to] = args;
		if (!from || !to) return { ok: false, output: '', reason: 'bad args' };
		if (
			await access(to).then(
				() => true,
				() => false,
			)
		) {
			return {
				ok: false,
				output: '',
				reason: `destination exists, source=${from}`,
			};
		}
		await rename(from, to);
	}
	return { ok: true, output: '' };
};

const PROPOSALS_DIR = 'docs/delendai/proposals';
const INDEX_FILE = '.cache/delendai/proposals/index.json';

const makeOptions = (root: string): ISyncProposalsToolOptions => ({
	namespacePrefix: 'proposals',
	workspaceRoot: root,
	layout: { proposalsDir: PROPOSALS_DIR, proposalIndexFile: INDEX_FILE },
	gitRunner: FAKE_GIT_MV,
});

const writeProposal = async (
	root: string,
	relPath: string,
	frontmatter: Record<string, string>,
): Promise<string> => {
	const abs = join(root, PROPOSALS_DIR, relPath);
	await mkdir(join(abs, '..'), { recursive: true });
	const lines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`);
	await writeFile(
		abs,
		`---\n${lines.join('\n')}\n---\n\n## Goal\n\nfixture\n`,
		'utf8',
	);
	return abs;
};

const withTempRoot = async (
	body: (root: string) => Promise<void>,
): Promise<void> => {
	const root = await mkdtemp(join(tmpdir(), 'sync-proposals-x00529-'));
	try {
		await body(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
};

/** Every file under the proposals tree whose frontmatter claims `id`. */
const findById = async (
	root: string,
	id: string,
): Promise<readonly string[]> => {
	const dir = join(root, PROPOSALS_DIR);
	const entries = await readdir(dir, { recursive: true });
	const found: string[] = [];
	for (const entry of entries) {
		const name = String(entry);
		if (!name.endsWith('.md')) continue;
		const text = await readFile(join(dir, name), 'utf8');
		if (text.includes(`id: ${id}`)) found.push(text);
	}
	return found;
};

const readIndex = async (
	root: string,
): Promise<{ count: number; proposals: Array<{ id: string }> }> =>
	JSON.parse(await readFile(join(root, INDEX_FILE), 'utf8')) as {
		count: number;
		proposals: Array<{ id: string }>;
	};

describe('createCollisionTolerantGitRunner (x00529 S3)', () => {
	it('passes non-mv commands straight through', async () => {
		const seen: string[][] = [];
		const runner = createCollisionTolerantGitRunner(
			async (args) => {
				seen.push([...args]);
				return { ok: true, output: 'inner' };
			},
			() => {
				throw new Error('should not report a collision');
			},
		);
		const result = await runner(['status', '--porcelain']);
		expect(result.output).toBe('inner');
		expect(seen).toEqual([['status', '--porcelain']]);
	});

	it('performs a normal mv when the destination is free', async () => {
		await withTempRoot(async (root) => {
			const from = await writeProposal(root, 'ready/x00529-a.md', {
				id: 'x00529',
				status: 'ready',
				kind: 'fix',
			});
			const to = join(root, PROPOSALS_DIR, 'review', 'x00529-a.md');
			await mkdir(join(root, PROPOSALS_DIR, 'review'), {
				recursive: true,
			});
			let collisions = 0;
			const runner = createCollisionTolerantGitRunner(FAKE_GIT_MV, () => {
				collisions += 1;
			});
			const result = await runner(['mv', from, to]);
			expect(result.ok).toBe(true);
			expect(collisions).toBe(0);
			expect(await readFile(to, 'utf8')).toContain('id: x00529');
		});
	});

	it('skips (never clobbers) an mv onto an occupied destination and reports it', async () => {
		await withTempRoot(async (root) => {
			const from = await writeProposal(root, 'ready/x00529-a.md', {
				id: 'x00529',
				status: 'done',
				kind: 'fix',
			});
			const to = await writeProposal(root, 'done/fixes/x00529-a.md', {
				id: 'x00529',
				status: 'done',
				kind: 'fix',
				'shipped-in': 'abc1234',
			});
			const reported: string[] = [];
			const runner = createCollisionTolerantGitRunner(
				FAKE_GIT_MV,
				(message) => reported.push(message),
			);
			const result = await runner(['mv', from, to]);

			expect(result.ok).toBe(true);
			expect(reported).toHaveLength(1);
			expect(reported[0]).toContain('duplicate proposal on disk');
			// Neither file was touched: the advanced copy keeps its
			// `shipped-in`, and the source is still there to be triaged.
			expect(await readFile(to, 'utf8')).toContain('shipped-in: abc1234');
			expect(await readFile(from, 'utf8')).toContain('id: x00529');
		});
	});
});

describe('runSyncProposals (x00529 S3)', () => {
	it('returns an empty errors list on a clean tree', async () => {
		await withTempRoot(async (root) => {
			await writeProposal(root, 'ready/fixes/x00600-clean.md', {
				id: 'x00600',
				status: 'ready',
				kind: 'fix',
				type: 'proposal',
				track: 'trust',
				date: '2026-09-08',
				title: 'clean fixture',
			});
			const payload = await runSyncProposals(makeOptions(root));
			expect(payload.errors).toEqual([]);
			expect(payload.count).toBe(1);
		});
	});

	it('indexes the rest of the tree and reports the duplicate instead of throwing', async () => {
		await withTempRoot(async (root) => {
			// The exact 2026-09-08 shape: the same id in two status
			// folders, the advanced copy carrying `shipped-in`.
			// Identical titles, so both resolve to the SAME canonical
			// filename and the reconciler really does try to move one
			// onto the other — the shape that threw in production.
			await writeProposal(root, 'ready/feats/f00284-dup-pair.md', {
				id: 'f00284',
				status: 'done',
				kind: 'feat',
				type: 'proposal',
				track: 'trust',
				date: '2026-09-08',
				title: 'dup pair',
			});
			await writeProposal(root, 'done/feats/f00284-dup-pair.md', {
				id: 'f00284',
				status: 'done',
				kind: 'feat',
				type: 'proposal',
				track: 'trust',
				date: '2026-09-08',
				title: 'dup pair',
				'shipped-in': 'abc1234',
			});
			// Bystanders: these must still be indexed.
			for (const id of ['x00601', 'x00602', 'x00603']) {
				await writeProposal(root, `ready/fixes/${id}-bystander.md`, {
					id,
					status: 'ready',
					kind: 'fix',
					type: 'proposal',
					track: 'trust',
					date: '2026-09-08',
					title: `bystander ${id}`,
				});
			}

			const payload = await runSyncProposals(makeOptions(root));

			// It did not throw, and the duplicate is named.
			const joined = payload.errors.join('\n');
			expect(joined).toContain('f00284');
			expect(
				payload.errors.some(
					(line) =>
						line.includes('duplicate proposal') ||
						line.includes('duplicate proposal id'),
				),
			).toBe(true);

			// The index was actually regenerated, and every bystander is in it.
			const index = await readIndex(root);
			const ids = new Set(index.proposals.map((entry) => entry.id));
			expect(ids.has('x00601')).toBe(true);
			expect(ids.has('x00602')).toBe(true);
			expect(ids.has('x00603')).toBe(true);
			expect(ids.has('f00284')).toBe(true);

			// `count` reflects what was actually indexed.
			expect(payload.count).toBe(index.count);
			expect(payload.count).toBeGreaterThanOrEqual(4);

			// Nothing was destroyed while degrading: BOTH copies survive
			// for a human (or the S2 lint) to resolve, including the
			// advanced one with its `shipped-in`.
			const survivors = await findById(root, 'f00284');
			expect(survivors).toHaveLength(2);
			expect(
				survivors.some((text) => text.includes('shipped-in: abc1234')),
			).toBe(true);
		});
	});
});

/**
 * The control: with the raw engine and a realistic git, the very same
 * fixture throws before the index is written. This is the regression
 * the S3 wrapper exists to prevent, asserted from both sides.
 */
describe('the failure S3 removes', () => {
	const seedDuplicate = async (root: string): Promise<void> => {
		for (const [folder, extra] of [
			['ready/feats', {}],
			['done/feats', { 'shipped-in': 'abc1234' }],
		] as const) {
			await writeProposal(root, `${folder}/f00284-dup-pair.md`, {
				id: 'f00284',
				status: 'done',
				kind: 'feat',
				type: 'proposal',
				track: 'trust',
				date: '2026-09-08',
				title: 'dup pair',
				...extra,
			});
		}
		await writeProposal(root, 'ready/fixes/x00601-bystander.md', {
			id: 'x00601',
			status: 'ready',
			kind: 'fix',
			type: 'proposal',
			track: 'trust',
			date: '2026-09-08',
			title: 'bystander x00601',
		});
	};

	it('the raw engine throws on the duplicate and never writes the index', async () => {
		await withTempRoot(async (root) => {
			await seedDuplicate(root);
			await expect(
				syncProposalRegistry(
					root,
					{
						proposalsDir: PROPOSALS_DIR,
						proposalIndexFile: INDEX_FILE,
					},
					[],
					FAKE_GIT_REALISTIC,
				),
			).rejects.toThrow(/refusing to overwrite existing target/);
			await expect(readIndex(root)).rejects.toThrow();
		});
	});

	it('the tool, given the same git, degrades: index written, duplicate in errors[]', async () => {
		await withTempRoot(async (root) => {
			await seedDuplicate(root);
			const payload = await runSyncProposals({
				namespacePrefix: 'proposals',
				workspaceRoot: root,
				layout: {
					proposalsDir: PROPOSALS_DIR,
					proposalIndexFile: INDEX_FILE,
				},
				gitRunner: FAKE_GIT_REALISTIC,
			});
			expect(payload.errors.join('\n')).toContain('f00284');
			const index = await readIndex(root);
			expect(index.proposals.map((entry) => entry.id)).toContain(
				'x00601',
			);
			expect(payload.count).toBe(index.count);
			expect(await findById(root, 'f00284')).toHaveLength(2);
		});
	});
});
