/**
 * proposal-id-allocator-lock.spec.ts — the counter mutex covers only the
 * allocation: a slow claim on the remote never blocks another session.
 */
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { allocateNextProposalId } from '@delendai/proposals/lib/proposals/proposal-id-allocator';

describe('allocateNextProposalId holds the mutex only to allocate', () => {
	let root: string;
	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'id-allocator-short-lock-'));
		await mkdir(join(root, 'proposals', 'ready'), { recursive: true });
	});
	afterEach(async () => rm(root, { recursive: true, force: true }));

	it('does not block a concurrent allocation while a long claim is in progress', async () => {
		let finishLongClaim: () => void = () => undefined;
		const longClaim = new Promise<void>((resolve) => {
			finishLongClaim = resolve;
		});
		const counter = join(root, 'git-common', 'proposal-id-counters.json');
		const sources = (slow: boolean) => ({
			sharedCounterPath: async () => counter,
			elsewhere: async () => ({}),
			reserve: async () => {
				if (slow) await longClaim;
				return 'reserved' as const;
			},
		});
		const options = (name: string, slow: boolean) => ({
			proposalsDirAbs: join(root, 'proposals'),
			counterPathAbs: join(root, `${name}.json`),
			sources: sources(slow),
		});

		const slow = allocateNextProposalId('x', options('slow', true));
		// Held across the claim, the mutex kept this one waiting until it failed.
		const quick = await allocateNextProposalId(
			'x',
			options('quick', false),
		);
		finishLongClaim();

		expect(quick).toBe('x00002');
		expect(await slow).toBe('x00001');
	});
});
