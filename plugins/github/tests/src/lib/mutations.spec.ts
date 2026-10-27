/**
 * mutations.spec.ts — every mutation resolves its repository from the
 * call or the config, and refuses one that is not GitHub-shaped before
 * any request leaves.
 */
import { describe, expect, it } from 'vitest';

import type { IGitHubProviderContext } from '../../../src/lib/config';
import { createGitHubMutations } from '../../../src/lib/mutations';

const context = (
	repository: { owner: string; repository: string } | undefined,
): IGitHubProviderContext => ({
	provider: 'github',
	token: 'secret-token',
	apiBaseUrl: 'https://api.github.com',
	webBaseUrl: 'https://github.com',
	host: 'github.com',
	repository:
		repository === undefined
			? null
			: {
					provider: 'github',
					host: 'github.com',
					...repository,
					webUrl: 'https://github.com/x/y',
					apiUrl: 'https://api.github.com/repos/x/y',
				},
	timeoutMs: 1000,
	maxRetries: 0,
	retryBaseDelayMs: 1,
	sources: {
		token: 'env:GITHUB_TOKEN',
		apiBaseUrl: 'default',
		webBaseUrl: 'default',
		repository: ['plugin'],
	},
});

const build = (
	repository: { owner: string; repository: string } | undefined,
) => {
	const urls: string[] = [];
	const mutations = createGitHubMutations({
		context: context(repository),
		mutationDeps: {
			fetchFn: async (url) => {
				urls.push(url);
				return {
					ok: true,
					status: 200,
					headers: { get: () => null },
					text: async () => '{}',
				};
			},
		},
		nowIso: () => '2026-08-31T00:00:00.000Z',
	});
	return { mutations, urls };
};

const call = (
	mutations: ReturnType<typeof build>['mutations'],
	selector: { owner?: string; repository?: string },
) => {
	const common = { ...selector, confirm: true } as const;
	return [
		mutations.updateIssue({ ...common, issue: 1, state: 'closed' }),
		mutations.createIssueComment({ ...common, issue: 1, body: 'hi' }),
		mutations.dispatchWorkflow({
			...common,
			workflowId: 'ci.yml',
			ref: 'main',
		}),
		mutations.dispatchRepository({ ...common, eventType: 'cut' }),
		mutations.createRelease({ ...common, tagName: 'v1' }),
		mutations.updateRelease({ ...common, releaseId: 7, name: 'v1' }),
		mutations.deleteRelease({ ...common, releaseId: 7 }),
		mutations.createTag({ ...common, tagName: 'v1', sha: 'abc' }),
		mutations.deleteTag({ ...common, tagName: 'v1' }),
	];
};

describe('github mutations repository resolution', () => {
	it.each([
		['an owner that walks the path', { owner: '../..', repository: 'r' }],
		['a repository that walks the path', { owner: 'o', repository: '..' }],
	])('refuses %s without a request', async (_label, selector) => {
		const { mutations, urls } = build({ owner: 'ok', repository: 'repo' });
		const results = await Promise.all(call(mutations, selector));
		expect(urls).toEqual([]);
		for (const result of results) {
			expect(result).toMatchObject({
				ok: false,
				error: {
					code: 'invalid-config',
					message:
						'github mutation requires a valid owner and repository',
				},
			});
		}
	});

	it('refuses a configured default that is not GitHub-shaped', async () => {
		const { mutations, urls } = build({
			owner: '-bad',
			repository: 'repo',
		});
		const results = await Promise.all(call(mutations, {}));
		expect(urls).toEqual([]);
		expect(results.every((result) => result.ok === false)).toBe(true);
	});

	it('refuses when neither the call nor the config names a repository', async () => {
		const { mutations, urls } = build(undefined);
		const results = await Promise.all(call(mutations, {}));
		expect(urls).toEqual([]);
		expect(results.every((result) => result.ok === false)).toBe(true);
	});

	it('sends each mutation to the resolved repository', async () => {
		const { mutations, urls } = build({ owner: 'ok', repository: 'repo' });
		await Promise.all(call(mutations, { owner: 'o', repository: 'r.js' }));
		expect(urls).toHaveLength(9);
		expect(urls.every((url) => url.includes('/repos/o/r.js/'))).toBe(true);
	});
});
