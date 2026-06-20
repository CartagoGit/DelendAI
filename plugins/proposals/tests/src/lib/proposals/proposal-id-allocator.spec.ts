import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	allocateNextProposalId,
	prefixForKind,
} from '@mcp-vertex/proposals/lib/proposals/proposal-id-allocator';

describe('allocateNextProposalId (f113 S13)', () => {
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
		expect(id).toBe('f1');
	});

	it('seeds from disk, taking the max existing number per prefix (legacy + f113 already there)', async () => {
		await writeFile(join(root, 'p99-feat-multi-model-audit-plugin.md'), '');
		await writeFile(join(root, 'p112-derive-site-manifests.md'), '');
		await mkdir(join(root, 'ready'), { recursive: true });
		await writeFile(
			join(root, 'ready', 'f113-feat-proposal-state-machine.md'),
			'',
		);
		const id = await allocateNextProposalId('f', {
			proposalsDirAbs: root,
			counterPathAbs,
		});
		expect(id).toBe('f114');
		// A different prefix's seed is independent and unaffected.
		const idForX = await allocateNextProposalId('x', {
			proposalsDirAbs: root,
			counterPathAbs,
		});
		expect(idForX).toBe('x1');
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
		expect(ids).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
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
		expect([f1, x1, f2]).toEqual(['f1', 'x1', 'f2']);
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

describe('prefixForKind', () => {
	it('resolves a known kind to its prefix', () => {
		expect(prefixForKind('feat')).toBe('f');
		expect(prefixForKind('fix')).toBe('x');
		expect(prefixForKind('legacy')).toBe('l');
	});

	it('returns null for an unknown kind', () => {
		expect(prefixForKind('nonsense')).toBeNull();
	});
});
