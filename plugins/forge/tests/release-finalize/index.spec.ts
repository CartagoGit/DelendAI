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

	// MUY-ALTA #8: a PR detail that only exposes `branch` (and no
	// `headBranch`) must still resolve via the `??` fallback. Covers the
	// github fallback path for older Forge responses + GitLab's PR shape
	// where `branch` is the only field.
	it('uses the branch field as headBranch fallback', async () => {
		const basePr = pr('MERGED');
		const { headBranch: _ignored, ...prShape } = basePr;
		const finalPrShape: IForgePullRequestDetail =
			prShape as IForgePullRequestDetail;
		const receipt = await finalizeRelease(
			async () => finalPrShape,
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
		expect(receipt.operation).toBe('finalize');
		expect(receipt.details?.pullRequest).toBe('7');
	});

	// MUY-ALTA #9: SHAs undefined when the PR detail lacks
	// `mergeCommitSha`/`headSha` raises a specific error.
	it('rejects finalize when forge omits mergeCommitSha', async () => {
		const basePr = pr('MERGED');
		const { headSha: _h, mergeCommitSha: _m, ...prShapeRest } = basePr;
		const finalPrShape: IForgePullRequestDetail =
			prShapeRest as IForgePullRequestDetail;
		await expect(
			finalizeRelease(
				async () => finalPrShape,
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
		).rejects.toThrow('finalize requires Forge commit SHAs');
	});

	// MUY-ALTA: a finalize with a PR that targets something other than main
	// is rejected even when state is MERGED — release must land in main.
	it('rejects finalize when the PR targets a branch other than main', async () => {
		const prShape = { ...pr('MERGED'), baseBranch: 'develop' };
		await expect(
			finalizeRelease(
				async () => prShape,
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
		).rejects.toThrow(
			'release PR must target main from the candidate branch',
		);
	});
});
