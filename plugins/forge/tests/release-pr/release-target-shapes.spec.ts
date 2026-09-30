/**
 * The release promotion follows the project's policy, whatever its shape.
 */
import { describe, expect, it, vi } from 'vitest';

import {
	resolveReleaseTarget,
	type IReleaseTarget,
} from '@delendai/core/public';
import { resolveDevelopmentPolicy } from '@delendai/core/lib/development-policy/resolve';

import type { IForgePullRequestDetail } from '../../src/lib/contracts/interfaces/forge-read.interface';
import { finalizeRelease } from '../../src/lib/release-finalize';
import {
	createReleasePullRequest,
	planReleasePromotion,
	type IReleasePrProvider,
} from '../../src/lib/release-pr';

const targetFor = (development: Record<string, unknown>): IReleaseTarget =>
	resolveReleaseTarget(resolveDevelopmentPolicy({ development }));

const SHAPES = {
	twoBranchPullRequest: targetFor({
		profile: 'shared-checkout-pr',
		branches: { integration: 'develop', release: 'main' },
	}),
	customNames: targetFor({
		profile: 'shared-checkout-pr',
		branches: { integration: 'trunk', release: 'stable' },
	}),
	singleBranch: targetFor({
		profile: 'shared-checkout-pr',
		branches: { integration: 'main' },
	}),
	merge: targetFor({
		profile: 'shared-checkout-merge',
		branches: { integration: 'trunk', release: 'stable' },
	}),
	direct: targetFor({
		profile: 'shared-direct',
		branches: { integration: 'trunk', release: 'stable' },
	}),
};

const candidate = {
	sourceDevelopSha: 'abcdef1',
	baseMainSha: 'abcdef2',
	fromVersion: '1.4.2',
	targetVersion: '1.4.3',
	type: 'patch' as const,
	slug: 'august-cut',
	branch: 'release/patch/august-cut',
	actor: 'agent',
	timestamp: '2026-08-31T00:00:00.000Z',
	includedProposals: [],
	state: 'cut' as const,
};

const makeProvider = () => {
	const provider: IReleasePrProvider = {
		listPullRequests: vi.fn(async () => []),
		createPullRequest: vi.fn(async (input) => ({
			number: 51,
			url: 'https://forge.example/pr/51',
			title: input.title,
			headBranch: input.headBranch,
			baseBranch: input.baseBranch,
		})),
	};
	return provider;
};

const requestFor = (target: IReleaseTarget, provider: IReleasePrProvider) => ({
	candidate,
	gates: [],
	currentBranch: candidate.branch,
	upstream: `origin/${candidate.branch}`,
	provider,
	target,
});

describe('release pull request per project shape', () => {
	it('opens the pull request into main for develop to main', async () => {
		const provider = makeProvider();
		const result = await createReleasePullRequest(
			requestFor(SHAPES.twoBranchPullRequest, provider),
		);
		expect(result.pr.baseBranch).toBe('main');
		expect(result.description).toContain('Source develop SHA');
	});

	it('opens the pull request into the configured release branch', async () => {
		const provider = makeProvider();
		const result = await createReleasePullRequest(
			requestFor(SHAPES.customNames, provider),
		);
		expect(provider.listPullRequests).toHaveBeenCalledWith({
			headBranch: candidate.branch,
			baseBranch: 'stable',
		});
		expect(result.pr.baseBranch).toBe('stable');
		expect(result.description).toContain('Base stable SHA');
		expect(result.description).not.toContain('main');
	});

	it('rejects a provider that returns another base branch', async () => {
		const provider = makeProvider();
		vi.mocked(provider.createPullRequest).mockResolvedValue({
			number: 1,
			url: 'u',
			title: 't',
			headBranch: candidate.branch,
			baseBranch: 'main',
		});
		await expect(
			createReleasePullRequest(requestFor(SHAPES.customNames, provider)),
		).rejects.toMatchObject({ code: 'provider-contract' });
	});

	it('names a single-branch project as having no promotion', async () => {
		const provider = makeProvider();
		const request = requestFor(SHAPES.singleBranch, provider);
		await expect(createReleasePullRequest(request)).rejects.toMatchObject({
			code: 'no-pull-request',
		});
		await expect(planReleasePromotion(request)).resolves.toMatchObject({
			kind: 'none',
		});
		expect(provider.listPullRequests).not.toHaveBeenCalled();
		expect(provider.createPullRequest).not.toHaveBeenCalled();
	});

	it.each(['merge', 'direct'] as const)(
		'requests no pull request under the %s strategy',
		async (shape) => {
			const provider = makeProvider();
			const request = requestFor(SHAPES[shape], provider);
			await expect(
				createReleasePullRequest(request),
			).rejects.toMatchObject({ code: 'no-pull-request' });
			await expect(planReleasePromotion(request)).resolves.toEqual({
				kind: shape,
				headBranch: candidate.branch,
				baseBranch: 'stable',
			});
			expect(provider.listPullRequests).not.toHaveBeenCalled();
			expect(provider.createPullRequest).not.toHaveBeenCalled();
		},
	);

	it('plans a pull request only for the pull-request strategy', async () => {
		const provider = makeProvider();
		const plan = await planReleasePromotion(
			requestFor(SHAPES.customNames, provider),
		);
		expect(plan).toMatchObject({
			kind: 'pull-request',
			result: { created: true },
		});
	});
});

describe('release finalize per project shape', () => {
	const readiness = { ready: true, gates: [], blockingGates: [] } as const;
	const merged = (baseBranch: string): IForgePullRequestDetail => ({
		number: 7,
		title: 'release',
		branch: candidate.branch,
		state: 'MERGED',
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
		baseBranch,
		draft: false,
		mergeable: 'MERGEABLE',
		reviewDecision: 'APPROVED',
		checks: [],
		headSha: 'ccccccc',
		mergeCommitSha: 'ddddddd',
	});
	const expected = {
		releaseBranchSha: 'ccccccc',
		mainSha: 'ddddddd',
		targetVersion: candidate.targetVersion,
	};

	it('records the merge into the configured release branch', async () => {
		const receipt = await finalizeRelease(
			async () => merged('stable'),
			candidate,
			expected,
			readiness,
			'agent',
			'7',
			SHAPES.customNames,
		);
		expect(receipt).toMatchObject({ target: 'stable' });
	});

	it('refuses a pull request merged into another branch', async () => {
		await expect(
			finalizeRelease(
				async () => merged('main'),
				candidate,
				expected,
				readiness,
				'agent',
				'7',
				SHAPES.customNames,
			),
		).rejects.toThrow('must target stable');
	});

	it.each(['singleBranch', 'merge', 'direct'] as const)(
		'has no pull request to finalize for %s',
		async (shape) => {
			const read = vi.fn(async () => merged('stable'));
			await expect(
				finalizeRelease(
					read,
					candidate,
					expected,
					readiness,
					'agent',
					'7',
					SHAPES[shape],
				),
			).rejects.toMatchObject({ code: 'no-pull-request' });
			expect(read).not.toHaveBeenCalled();
		},
	);
});
