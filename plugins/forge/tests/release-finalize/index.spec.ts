import { describe, expect, it } from 'vitest';

import {
	finalizeRelease,
	stabilizeRelease,
} from '../../src/lib/release-finalize';
import type { IForgePullRequestDetail } from '../../src/lib/contracts/interfaces/forge-read.interface';

const candidate = {
	sourceDevelopSha: 'aaaaaaa',
	baseMainSha: 'bbbbbbb',
	fromVersion: '1.2.2',
	targetVersion: '1.2.3',
	type: 'patch' as const,
	slug: 'finalize-test',
	branch: 'release/patch/finalize-test',
	actor: 'agent',
	timestamp: new Date(0).toISOString(),
	includedProposals: [],
	state: 'cut' as const,
};

const pr = (state: string): IForgePullRequestDetail => ({
	number: 7,
	title: 'release',
	branch: candidate.branch,
	state,
	author: 'agent',
	url: 'https://forge/pr/7',
	labels: [],
	ciSummary: {
		total: 0,
		successful: 0,
		failed: 0,
		pending: 0,
		running: 0,
	},
	headBranch: candidate.branch,
	baseBranch: 'main',
	draft: false,
	mergeable: 'MERGEABLE',
	reviewDecision: 'APPROVED',
	checks: [],
	headSha: 'ccccccc',
	mergeCommitSha: 'ddddddd',
});

describe('release finalize', () => {
	it('stabilizes only after readiness and records the stage', () => {
		expect(
			stabilizeRelease(
				candidate,
				{ ready: true, gates: [], blockingGates: [] },
				'agent',
			),
		).toMatchObject({
			operation: 'stabilize',
			releaseSlug: candidate.slug,
		});
	});
	it('does not finalize before readiness', async () => {
		await expect(
			finalizeRelease(
				async () => pr('MERGED'),
				candidate,
				{
					releaseBranchSha: 'ccccccc',
					mainSha: 'ddddddd',
					targetVersion: '1.2.3',
				},
				{ ready: false, gates: [], blockingGates: ['tests'] },
				'agent',
				'7',
			),
		).rejects.toThrow('not ready');
	});

	it('creates a receipt only when Forge reports merged', async () => {
		const receipt = await finalizeRelease(
			async () => pr('MERGED'),
			candidate,
			{
				releaseBranchSha: 'ccccccc',
				mainSha: 'ddddddd',
				targetVersion: '1.2.3',
			},
			{ ready: true, gates: [], blockingGates: [] },
			'agent',
			'7',
		);
		expect(receipt).toMatchObject({
			operation: 'finalize',
			status: 'completed',
			after: 'ddddddd',
		});
	});

	it('rejects an unmerged PR', async () => {
		await expect(
			finalizeRelease(
				async () => pr('OPEN'),
				candidate,
				{
					releaseBranchSha: 'ccccccc',
					mainSha: 'ddddddd',
					targetVersion: '1.2.3',
				},
				{ ready: true, gates: [], blockingGates: [] },
				'agent',
				'7',
			),
		).rejects.toThrow('requires Forge to report the PR as merged');
	});
});
