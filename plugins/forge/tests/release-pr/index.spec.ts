import { describe, expect, it } from 'vitest';

import type {
	IReleasePrProvider,
	IReleasePrRecord,
} from '../../src/lib/release-pr';
import { createReleasePullRequest } from '../../src/lib/release-pr';

const candidate = {
	sourceDevelopSha: 'abcdef1',
	baseMainSha: 'abcdef2',
	fromVersion: '1.4.2',
	targetVersion: '1.4.3',
	type: 'patch' as const,
	slug: 'august-cut',
	branch: 'release/patch/august-cut',
	actor: 'release-agent',
	timestamp: new Date(0).toISOString(),
	includedProposals: ['f00390'],
	state: 'cut' as const,
};

const makeProvider = (existing: readonly IReleasePrRecord[] = []) => {
	const created: Array<{
		headBranch: string;
		baseBranch: 'main';
		body: string;
	}> = [];
	const provider: IReleasePrProvider = {
		listPullRequests: async () => existing,
		createPullRequest: async (input) => {
			created.push(input);
			return {
				number: 51,
				url: 'https://forge.example/pr/51',
				title: 'Release 1.4.3',
				headBranch: input.headBranch,
				baseBranch: input.baseBranch,
			};
		},
	};
	return { provider, created };
};

describe('release PR forge contract', () => {
	it('creates through the provider boundary with derived metadata', async () => {
		const { provider, created } = makeProvider();
		const result = await createReleasePullRequest({
			candidate,
			currentBranch: candidate.branch,
			upstream: 'origin/release/patch/august-cut',
			gates: [
				{ name: 'tests', status: 'passed' },
				{ name: 'generated-drift', status: 'passed' },
			],
			provider,
		});
		expect(result.created).toBe(true);
		expect(created[0]).toMatchObject({
			headBranch: candidate.branch,
			baseBranch: 'main',
		});
		expect(result.description).toContain('PR #50');
		expect(result.description).toContain('abcdef1');
		expect(result.description).toContain('1.4.2 -> 1.4.3');
		expect(result.description).not.toMatch(/merge/i);
	});

	it('returns an existing matching PR and does not create a duplicate', async () => {
		const existing = {
			number: 51,
			url: 'https://forge.example/pr/51',
			title: 'Release 1.4.3',
			headBranch: candidate.branch,
			baseBranch: 'main' as const,
		};
		const { provider, created } = makeProvider([existing]);
		const result = await createReleasePullRequest({
			candidate,
			currentBranch: candidate.branch,
			upstream: 'origin/release/patch/august-cut',
			gates: [{ name: 'tests', status: 'passed' }],
			provider,
		});
		expect(result).toMatchObject({ created: false, pr: existing });
		expect(created).toHaveLength(0);
	});

	it('blocks failed generated drift and readiness gates', async () => {
		const { provider } = makeProvider();
		await expect(
			createReleasePullRequest({
				candidate,
				currentBranch: candidate.branch,
				upstream: 'origin/release/patch/august-cut',
				gates: [{ name: 'generated-drift', status: 'failed' }],
				provider,
			}),
		).rejects.toThrowError(
			expect.objectContaining({ code: 'readiness-blocked' }),
		);
	});

	it('rejects invalid release metadata before calling the provider', async () => {
		const { provider, created } = makeProvider();
		await expect(
			createReleasePullRequest({
				candidate: { ...candidate, targetVersion: '9.9.9' },
				currentBranch: candidate.branch,
				upstream: 'origin/release/patch/august-cut',
				gates: [],
				provider,
			}),
		).rejects.toThrowError(/targetVersion/);
		expect(created).toHaveLength(0);
	});

	it('rejects a provider response with an unexpected base branch', async () => {
		const { provider } = makeProvider();
		provider.createPullRequest = async (input) =>
			({
				number: 51,
				url: 'https://forge.example/pr/51',
				title: 'Release 1.4.3',
				headBranch: input.headBranch,
				baseBranch: 'develop',
			}) as IReleasePrRecord;
		await expect(
			createReleasePullRequest({
				candidate,
				currentBranch: candidate.branch,
				upstream: 'origin/release/patch/august-cut',
				gates: [],
				provider,
			}),
		).rejects.toThrowError(
			expect.objectContaining({
				code: 'provider-contract',
				details: expect.objectContaining({
					actualBaseBranch: 'develop',
				}),
			}),
		);
	});

	it('rejects a provider call from the wrong branch or without upstream', async () => {
		const { provider } = makeProvider();
		await expect(
			createReleasePullRequest({
				candidate,
				currentBranch: 'develop',
				upstream: 'origin/develop',
				gates: [],
				provider,
			}),
		).rejects.toThrowError(
			expect.objectContaining({ code: 'wrong-branch' }),
		);
		await expect(
			createReleasePullRequest({
				candidate,
				currentBranch: candidate.branch,
				gates: [],
				provider,
			}),
		).rejects.toThrowError(
			expect.objectContaining({ code: 'missing-upstream' }),
		);
	});
});
