import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	allocateNextProposalId,
	prefixForKind,
} from '@delendai/proposals/lib/proposals/proposal-id-allocator';

describe('allocateNextProposalId (f00016 S13)', async () => {
	let root = '';
	let counterPathAbs = '';

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'id-allocator-'));
		counterPathAbs = join(root, 'proposal-id-counters.json');
	});

	afterEach(async () => rm(root, { recursive: true, force: true }));

	it('seeds from an empty proposalsDir and starts at 1', async () => {
		const id = await allocateNextProposalId('f', {
			proposalsDirAbs: root,
			counterPathAbs,
		});
		expect(id).toBe('f00001');
	});

	it('seeds from disk, taking the max existing number per prefix (legacy + f00016 already there)', async () => {
		await writeFile(join(root, 'l99-feat-multi-model-audit-plugin.md'), '');
		await writeFile(join(root, 'l112-derive-site-manifests.md'), '');
		await mkdir(join(root, 'ready'), { recursive: true });
		await writeFile(
			join(root, 'ready', 'f00016-feat-proposal-state-machine.md'),
			'',
		);
		const id = await allocateNextProposalId('f', {
			proposalsDirAbs: root,
			counterPathAbs,
		});
		// Max f-id on disk is 16, so the next allocation is 17, padded.
		expect(id).toBe('f00017');
		// A different prefix's seed is independent and unaffected.
		const idForX = await allocateNextProposalId('x', {
			proposalsDirAbs: root,
			counterPathAbs,
		});
		expect(idForX).toBe('x00001');
	});

	it('increments sequentially across repeated calls, no gaps', async () => {
		const ids: string[] = [];
		for (let i = 0; i < 5; i++) {
			ids.push(
				await allocateNextProposalId('a', {
					proposalsDirAbs: root,
					counterPathAbs,
				}),
			);
		}
		expect(ids).toEqual(['a00001', 'a00002', 'a00003', 'a00004', 'a00005']);
	});

	it('keeps each prefix on its own independent sequence', async () => {
		const f1 = await allocateNextProposalId('f', {
			proposalsDirAbs: root,
			counterPathAbs,
		});
		const x1 = await allocateNextProposalId('x', {
			proposalsDirAbs: root,
			counterPathAbs,
		});
		const f2 = await allocateNextProposalId('f', {
			proposalsDirAbs: root,
			counterPathAbs,
		});
		expect([f1, x1, f2]).toEqual(['f00001', 'x00001', 'f00002']);
	});

	it('is race-safe: N concurrent calls for the same prefix produce N distinct, sequential ids', async () => {
		const N = 25;
		const results = await Promise.all(
			Array.from({ length: N }, () =>
				allocateNextProposalId('r', {
					proposalsDirAbs: root,
					counterPathAbs,
				}),
			),
		);
		const numbers = results
			.map((id) => Number(id.slice(1)))
			.sort((a, b) => a - b);
		expect(new Set(numbers).size).toBe(N); // no duplicates
		expect(numbers).toEqual(Array.from({ length: N }, (_, i) => i + 1)); // no gaps, sequential
	});

	it('persists the counter file as valid JSON across calls', async () => {
		await allocateNextProposalId('c', {
			proposalsDirAbs: root,
			counterPathAbs,
		});
		await allocateNextProposalId('c', {
			proposalsDirAbs: root,
			counterPathAbs,
		});
		const raw = await readFile(counterPathAbs, 'utf8');
		expect(JSON.parse(raw)).toEqual({ c: 2 });
	});
});

describe('prefixForKind', async () => {
	it('resolves a known kind to its prefix', async () => {
		expect(prefixForKind('feat')).toBe('f');
		expect(prefixForKind('fix')).toBe('x');
		expect(prefixForKind('legacy')).toBe('l');
	});

	it('returns null for an unknown kind', async () => {
		expect(prefixForKind('nonsense')).toBeNull();
	});
});

/**
 * The counter file is not the only source: disk always participates.
 * Reproduced in a00085: `create_proposal` reissued `a00084` because the
 * persisted counter lagged the tree.
 */
describe('a stale counter file does not reissue ids already on disk', async () => {
	let root = '';
	let counterPathAbs = '';

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'id-allocator-stale-'));
		counterPathAbs = join(root, 'proposal-id-counters.json');
		await mkdir(join(root, 'ready'), { recursive: true });
	});

	afterEach(async () => rm(root, { recursive: true, force: true }));

	it('does not return an id that is already on disk', async () => {
		await writeFile(counterPathAbs, JSON.stringify({ r: 4 }));
		await writeFile(
			join(root, 'ready', 'r00005-from-another-agent.md'),
			'',
		);

		const id = await allocateNextProposalId('r', {
			proposalsDirAbs: root,
			counterPathAbs,
		});
		expect(id).toBe('r00006');
	});

	it('lets the counter win when it is ahead of disk', async () => {
		await writeFile(counterPathAbs, JSON.stringify({ r: 9 }));
		await writeFile(join(root, 'ready', 'r00002-old.md'), '');

		const id = await allocateNextProposalId('r', {
			proposalsDirAbs: root,
			counterPathAbs,
		});
		expect(id).toBe('r00010');
	});

	it('reconciles each prefix independently', async () => {
		await writeFile(counterPathAbs, JSON.stringify({ r: 1, f: 20 }));
		await writeFile(join(root, 'ready', 'r00007-on-disk.md'), '');

		expect(
			await allocateNextProposalId('r', {
				proposalsDirAbs: root,
				counterPathAbs,
			}),
		).toBe('r00008');
		expect(
			await allocateNextProposalId('f', {
				proposalsDirAbs: root,
				counterPathAbs,
			}),
		).toBe('f00021');
	});
});

/**
 * The counter file is not the only source: disk always participates.
 *
 * Proposals reach the tree by routes that never touch this allocator
 * (hand-written, merge, other agent). A present-but-stale counter
 * used to reissue an id that was already on disk — reproduced as two
 * `r00005` files, and again as `create_proposal` reissuing `a00084`
 * during a00085.
 */
describe('stale counter file does not reissue on-disk ids', async () => {
	let root = '';
	let counterPathAbs = '';

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'id-allocator-stale-'));
		counterPathAbs = join(root, 'proposal-id-counters.json');
		await mkdir(join(root, 'ready'), { recursive: true });
	});

	afterEach(async () => rm(root, { recursive: true, force: true }));

	it('does not return an id that already exists on disk', async () => {
		await writeFile(counterPathAbs, JSON.stringify({ r: 4 }));
		await writeFile(join(root, 'ready', 'r00005-from-other-agent.md'), '');

		const id = await allocateNextProposalId('r', {
			proposalsDirAbs: root,
			counterPathAbs,
		});
		expect(id).toBe('r00006');
	});

	it('lets the counter win when it is ahead of disk', async () => {
		await writeFile(counterPathAbs, JSON.stringify({ r: 9 }));
		await writeFile(join(root, 'ready', 'r00002-old.md'), '');

		const id = await allocateNextProposalId('r', {
			proposalsDirAbs: root,
			counterPathAbs,
		});
		expect(id).toBe('r00010');
	});

	it('reconciles each prefix independently', async () => {
		await writeFile(counterPathAbs, JSON.stringify({ r: 1, f: 20 }));
		await writeFile(join(root, 'ready', 'r00007-on-disk.md'), '');

		expect(
			await allocateNextProposalId('r', {
				proposalsDirAbs: root,
				counterPathAbs,
			}),
		).toBe('r00008');
		expect(
			await allocateNextProposalId('f', {
				proposalsDirAbs: root,
				counterPathAbs,
			}),
		).toBe('f00021');
	});
});
