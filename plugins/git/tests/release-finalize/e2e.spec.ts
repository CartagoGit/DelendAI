import { describe, expect, it } from 'vitest';

import {
	createReleasePullRequest,
	type IReleasePrProvider,
} from '../../../forge/src/lib/release-pr';
import {
	finalizeRelease,
	stabilizeRelease,
} from '../../../forge/src/lib/release-finalize';
import { reconcileRelease } from '../../src/lib/release-finalize';
import type { IReleasePrRecord } from '../../../forge/src/lib/release-pr';

const candidate = {
	sourceDevelopSha: 'aaaaaaa',
	baseMainSha: 'bbbbbbb',
	fromVersion: '1.2.2',
	targetVersion: '1.2.3',
	type: 'patch' as const,
	slug: 'e2e-release',
	branch: 'release/patch/e2e-release',
	actor: 'agent',
	timestamp: new Date(0).toISOString(),
	includedProposals: [],
	state: 'cut' as const,
};

describe('release cut to reconcile E2E', () => {
	it('runs cut -> stabilize -> PR -> finalize -> reconcile', async () => {
		const readiness = {
			ready: true,
			gates: [],
			blockingGates: [],
		} as const;
		const stabilized = stabilizeRelease(candidate, readiness, 'agent');
		const pr = await createReleasePullRequest({
			candidate,
			gates: [],
			currentBranch: candidate.branch,
			upstream: 'origin/release/patch/e2e-release',
			provider: {
				listPullRequests: async () => [],
				createPullRequest: async (
					input: Parameters<
						IReleasePrProvider['createPullRequest']
					>[0],
				): Promise<IReleasePrRecord> => ({
					number: 9,
					url: 'https://forge.example/pr/9',
					title: input.title,
					headBranch: input.headBranch,
					baseBranch: input.baseBranch,
				}),
			},
		});
		const finalized = await finalizeRelease(
			async () => ({
				number: pr.pr.number,
				title: pr.pr.title,
				branch: candidate.branch,
				url: pr.pr.url,
				draft: false,
				author: 'agent',
				labels: [],
				ciSummary: {
					total: 0,
					successful: 0,
					failed: 0,
					pending: 0,
					running: 0,
				},
				state: 'MERGED',
				mergeable: 'MERGEABLE',
				reviewDecision: 'APPROVED',
				checks: [],
				headBranch: candidate.branch,
				baseBranch: 'main',
				headSha: 'ccccccc',
				mergeCommitSha: 'ddddddd',
			}),
			candidate,
			{
				releaseBranchSha: 'ccccccc',
				mainSha: 'ddddddd',
				targetVersion: candidate.targetVersion,
			},
			readiness,
			'agent',
			String(pr.pr.number),
		);
		const reconciled = await reconcileRelease(
			async () => ({ ok: true, output: '' }),
			{
				releaseSlug: candidate.slug,
				releaseBranchSha: 'ccccccc',
				developShaAtCut: candidate.sourceDevelopSha,
				developShaNow: 'eeeeeee',
				releaseOnlyFixes: ['version'],
				actor: 'agent',
			},
		);
		expect([
			stabilized.operation,
			pr.created,
			finalized.operation,
			reconciled.operation,
		]).toEqual(['stabilize', true, 'finalize', 'reconcile']);
	});
});
