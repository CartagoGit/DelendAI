import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import { settleAuthored } from '@delendai/core/lib/integration/land/land-authored-conflict.helper';
import type { IMovedProposalOutcome } from '@delendai/core/lib/integration/land/land-moved-proposal.interface';
import type {
	ILandConfig,
	ILandForge,
	ILandGit,
	ILandPullRequest,
} from '@delendai/core/lib/integration/land/land.interface';

const pr = (crossRepository = false): ILandPullRequest => ({
	number: 4,
	headRef: 'h',
	headSha: 'abc1234',
	draft: false,
	state: 'open',
	merged: false,
	labels: [],
	body: '',
	testedBase: 'def5678',
	crossRepository,
});

const settle = async (
	refreshed: IMovedProposalOutcome | undefined,
	crossRepository = false,
) => {
	const whys: string[] = [];
	const asked: string[] = [];
	const files = (...paths: string[]) => ({
		zones: new Set<string>(),
		files: new Set(paths),
	});
	await settleAuthored({
		deps: {
			forge: fakePartial<ILandForge>({}),
			config: fakePartial<ILandConfig>({}),
			git: fakePartial<ILandGit>({
				footprint: () => files('a.ts'),
				landedSince: () => files('a.ts', 'b.ts'),
			}),
			refreshMoved:
				refreshed === undefined ? undefined : async () => refreshed,
		},
		pr: pr(crossRepository),
		tip: 'tip',
		report: {
			why: (_number, reason) => void whys.push(reason),
			needsUpdate: (_pr, reason) => void asked.push(reason),
		},
	});
	return { whys, asked };
};

describe('settleAuthored', () => {
	it('[<5ms] asks nothing of the author once the moved proposal was refreshed', async () => {
		const { whys, asked } = await settle({ kind: 'brought' });
		expect(asked).toEqual([]);
		expect(whys).toHaveLength(1);
	});

	it('[<5ms] waits for the next pass when the head moved meanwhile', async () => {
		const { whys, asked } = await settle({ kind: 'moved' });
		expect(asked).toEqual([]);
		expect(whys[0]).toContain('moved');
	});

	it('[<5ms] asks the author with the comment the refresh wrote', async () => {
		const { asked } = await settle({ kind: 'asked', comment: 'merge it' });
		expect(asked).toEqual(['merge it']);
	});

	it('[<5ms] names the conflicting files when it is not a moved proposal', async () => {
		const { asked } = await settle({ kind: 'none' });
		expect(asked).toEqual([
			'it conflicts with the integration branch in a.ts',
		]);
	});

	it('[<5ms] never refreshes a cross-repository head, nor without a port', async () => {
		const cross = await settle({ kind: 'brought' }, true);
		expect(cross.asked).toHaveLength(1);
		expect((await settle(undefined)).asked).toHaveLength(1);
	});
});
