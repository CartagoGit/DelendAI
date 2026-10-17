import { describe, expect, it } from 'vitest';

import type { IGitRunner } from '../../../../src/lib/contracts/interfaces/git-runner.interface';
import { codeFreshnessProbe } from '../../../../src/lib/cli/code-freshness.service';

/** A checkout whose HEAD the test moves, and whose diff it decides. */
const checkout = (changed: string) => {
	let head = 'aaa111';
	const calls: string[][] = [];
	const git: IGitRunner = async (args) => {
		calls.push([...args]);
		if (args.includes('rev-parse'))
			return { ok: true, output: `${head}\n` };
		return { ok: true, output: changed };
	};
	return { git, calls, move: (to: string) => (head = to) };
};

describe('codeFreshnessProbe', () => {
	it('is fresh while the checkout has not moved', async () => {
		const repo = checkout('');
		const probe = codeFreshnessProbe(repo.git, '/code');
		expect(await probe()).toEqual({
			startedAt: 'aaa111',
			now: 'aaa111',
			stale: false,
		});
		expect(repo.calls[0]?.slice(0, 2)).toEqual(['-C', '/code']);
	});

	it('is stale when the checkout moved through the code a server loads', async () => {
		const repo = checkout('packages/core/src/lib/x.ts\n');
		const probe = codeFreshnessProbe(repo.git, '/code');
		await Promise.resolve();
		repo.move('bbb222');
		const answer = await probe();
		expect(answer).toMatchObject({
			startedAt: 'aaa111',
			now: 'bbb222',
			stale: true,
		});
		expect(answer.next).toContain('restart the host server');
	});

	it('is not stale when the move touched only what a server does not load', async () => {
		const repo = checkout('');
		const probe = codeFreshnessProbe(repo.git, '/code');
		await Promise.resolve();
		repo.move('ccc333');
		expect((await probe()).stale).toBe(false);
	});

	it('never calls an installed package stale', async () => {
		const git: IGitRunner = async () => ({ ok: false, output: '' });
		expect(await codeFreshnessProbe(git, '/code')()).toEqual({
			startedAt: null,
			now: null,
			stale: false,
		});
	});
});
