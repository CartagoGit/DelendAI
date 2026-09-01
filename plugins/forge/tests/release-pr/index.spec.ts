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
		baseBranch: string;
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

	// MUY-ALTA #4: branch that matches `RELEASE_BRANCH` regex but is NOT the
	// candidate branch is still `wrong-branch`. Catches a regression where a
	// permissive regex match falsely satisfies the first OR clause.
	it('rejects a release-shaped branch that is not the candidate branch', async () => {
		const { provider } = makeProvider();
		const expectedCandidate = {
			...candidate,
			slug: 'expected-slug',
			fromVersion: '1.4.2',
			targetVersion: '1.4.3',
			branch: 'release/patch/expected-slug',
		};
		await expect(
			createReleasePullRequest({
				candidate: expectedCandidate,
				currentBranch: 'release/patch/other-slug',
				upstream: 'origin/release/patch/other-slug',
				gates: [{ name: 'tests', status: 'passed' }],
				provider,
			}),
		).rejects.toThrowError(
			expect.objectContaining({
				code: 'wrong-branch',
				message: expect.stringContaining('release/patch/expected-slug'),
			}),
		);
	});

	// MUY-ALTA #3: documents that the `wrong-base` branch is dead code, because
	// `assertReleaseMetadata` runs the SHA regex (`/^[0-9a-f]{7,64}$/i`) before
	// release-pr checks `baseMainSha.trim() === ''`. A whitespace-only SHA fails
	// `invalid-metadata` first. This test pins that ordering as the observable
	// contract — and documents the latent redundancy so a future refactor that
	// removes `assertReleaseMetadata` cannot silently change the verdict.
	it('treats a whitespace-only baseMainSha as invalid-metadata (SHA regex gate first)', async () => {
		const { provider } = makeProvider();
		await expect(
			createReleasePullRequest({
				candidate: { ...candidate, baseMainSha: '   \n\t' },
				currentBranch: candidate.branch,
				upstream: `origin/${candidate.branch}`,
				gates: [{ name: 'tests', status: 'passed' }],
				provider,
			}),
		).rejects.toThrowError(
			expect.objectContaining({ code: 'invalid-metadata' }),
		);
	});

	// MUY-ALTA #6: whitespace-only upstream is `missing-upstream`.
	it('rejects whitespace-only upstream as missing', async () => {
		const { provider } = makeProvider();
		await expect(
			createReleasePullRequest({
				candidate,
				currentBranch: candidate.branch,
				upstream: '   \n  ',
				gates: [{ name: 'tests', status: 'passed' }],
				provider,
			}),
		).rejects.toThrowError(
			expect.objectContaining({ code: 'missing-upstream' }),
		);
	});

	// MUY-ALTA #5: when `listPullRequests` returns multiple matches, the
	// `.find` picks the first deterministic one (same headBranch + same
	// baseBranch). Documents idempotency semantics under multi-PR noise.
	it('returns the first matching existing PR when multiple are returned', async () => {
		const existing: IReleasePrRecord[] = [
			{
				number: 90,
				url: 'https://forge.example/pr/90',
				title: 'Release 1.4.3',
				headBranch: candidate.branch,
				baseBranch: 'main',
			},
			{
				number: 91,
				url: 'https://forge.example/pr/91',
				title: 'Release 1.4.3 (attempt 2)',
				headBranch: candidate.branch,
				baseBranch: 'main',
			},
		];
		const { provider, created } = makeProvider(existing);
		const result = await createReleasePullRequest({
			candidate,
			currentBranch: candidate.branch,
			upstream: `origin/${candidate.branch}`,
			gates: [{ name: 'tests', status: 'passed' }],
			provider,
		});
		expect(result.created).toBe(false);
		expect(result.pr.number).toBe(90);
		expect(created).toEqual([]);
	});

	// MUY-ALTA #7: provider response with unexpected headBranch is
	// `provider-contract`.
	it('rejects provider response with unexpected headBranch', async () => {
		const provider: IReleasePrProvider = {
			listPullRequests: async () => [],
			createPullRequest: async () => ({
				number: 81,
				url: 'https://forge.example/pr/81',
				title: 'Release 1.4.3',
				headBranch: 'release/patch/someone-else', // wrong!
				baseBranch: 'main',
			}),
		};
		await expect(
			createReleasePullRequest({
				candidate,
				currentBranch: candidate.branch,
				upstream: `origin/${candidate.branch}`,
				gates: [{ name: 'tests', status: 'passed' }],
				provider,
			}),
		).rejects.toThrowError(
			expect.objectContaining({ code: 'provider-contract' }),
		);
	});

	// ALTA #10/11: gate pending required blocks; failed optional does not.
	it('blocks pending required gates and ignores failed optional gates', async () => {
		const { provider } = makeProvider();
		await expect(
			createReleasePullRequest({
				candidate,
				currentBranch: candidate.branch,
				upstream: `origin/${candidate.branch}`,
				gates: [
					{ name: 'tests', status: 'passed' },
					{ name: 'docs', status: 'pending', required: true },
				],
				provider,
			}),
		).rejects.toThrowError(
			expect.objectContaining({
				code: 'readiness-blocked',
				message: expect.stringContaining('docs'),
			}),
		);
		const fallback = makeProvider();
		const result = await createReleasePullRequest({
			candidate,
			currentBranch: candidate.branch,
			upstream: `origin/${candidate.branch}`,
			gates: [
				{ name: 'tests', status: 'passed' },
				{ name: 'docs', status: 'failed', required: false },
			],
			provider: fallback.provider,
		});
		expect(result.created).toBe(true);
	});

	// ALTA #12: provider.listPullRequests that throws propagates raw.
	it('propagates raw exceptions from provider.listPullRequests', async () => {
		const provider: IReleasePrProvider = {
			listPullRequests: async () => {
				throw new Error('upstream timeout');
			},
			createPullRequest: async () => {
				throw new Error('should not call create');
			},
		};
		await expect(
			createReleasePullRequest({
				candidate,
				currentBranch: candidate.branch,
				upstream: `origin/${candidate.branch}`,
				gates: [{ name: 'tests', status: 'passed' }],
				provider,
			}),
		).rejects.toThrowError(/upstream timeout/);
	});

	// Custom releaseTargetBranch: the provider receives the configured
	// base branch instead of the hard-coded `main` default.
	it('uses the configured releaseTargetBranch instead of hard-coded main', async () => {
		const created: Array<{
			headBranch: string;
			baseBranch: string;
			body: string;
		}> = [];
		const provider: IReleasePrProvider = {
			listPullRequests: async () => [],
			createPullRequest: async (input) => {
				created.push(input);
				return {
					number: 60,
					url: 'https://forge.example/pr/60',
					title: input.title,
					headBranch: input.headBranch,
					baseBranch: input.baseBranch,
				};
			},
		};
		const result = await createReleasePullRequest({
			candidate,
			currentBranch: candidate.branch,
			upstream: `origin/${candidate.branch}`,
			gates: [{ name: 'tests', status: 'passed' }],
			provider,
			options: { releaseTargetBranch: 'production' },
		});
		expect(result.created).toBe(true);
		expect(result.pr.baseBranch).toBe('production');
		expect(created[0]?.baseBranch).toBe('production');
	});

	// Hard rule: PRs MUST target the release branch, never the
	// integration branch. Defaults reject this case so the
	// `release/** → main` flow is the only sanctioned shape.
	it('rejects when the candidate branch is itself configured as the integration branch', async () => {
		const { provider } = makeProvider();
		await expect(
			createReleasePullRequest({
				candidate,
				currentBranch: candidate.branch,
				upstream: `origin/${candidate.branch}`,
				gates: [{ name: 'tests', status: 'passed' }],
				provider,
				// Force the integration branch to be the release branch
				// itself; the contract MUST reject that configuration.
				options: { integrationBranch: candidate.branch },
			}),
		).rejects.toThrowError(
			expect.objectContaining({ code: 'integration-base-forbidden' }),
		);
	});

	it('still rejects when the integration branch matches the candidate even with a custom target', async () => {
		const { provider } = makeProvider();
		await expect(
			createReleasePullRequest({
				candidate,
				currentBranch: candidate.branch,
				upstream: `origin/${candidate.branch}`,
				gates: [{ name: 'tests', status: 'passed' }],
				provider,
				options: {
					releaseTargetBranch: 'production',
					integrationBranch: candidate.branch,
				},
			}),
		).rejects.toThrowError(
			expect.objectContaining({ code: 'integration-base-forbidden' }),
		);
	});
});
