import { describe, expect, it } from 'vitest';

import {
	runListIssues,
	type IGithubClient,
	type IListIssuesToolOptions,
} from '../../../../src/lib/tools/list-issues.tool';
import type {
	IFetchIssueResult,
	IListIssuesOptions,
	IListIssuesResult,
} from '../../../../src/lib/github-client';

const STUB_FETCH_RESULT: IFetchIssueResult = {
	data: {
		number: 1,
		title: 'stub',
		state: 'open',
		labels: [],
		author: 'octocat',
		url: 'https://github.com/o/r/issues/1',
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
		commentsCount: 0,
		body: 'stub body',
		comments: [],
	},
	comments: [],
	tier: 'gh',
};

const fakeClient = (
	listIssuesImpl: (opts?: IListIssuesOptions) => Promise<IListIssuesResult>,
): IGithubClient => ({
	fetchIssue: async () => STUB_FETCH_RESULT,
	listIssues: listIssuesImpl,
});

describe('issues_list', async () => {
	it('delegates to the injected client and returns issues + tier', async () => {
		let receivedOpts: IListIssuesOptions | undefined;
		const options: IListIssuesToolOptions = {
			namespacePrefix: 'issues',
			githubClient: fakeClient(async (opts) => {
				receivedOpts = opts;
				return {
					issues: [
						{
							number: 42,
							title: 'Something broke',
							state: 'open',
							labels: ['bug'],
							author: 'octocat',
							url: 'https://github.com/o/r/issues/42',
							createdAt: '2026-01-01T00:00:00Z',
							updatedAt: '2026-01-01T00:00:00Z',
							commentsCount: 2,
						},
					],
					tier: 'rest-authed',
				};
			}),
		};

		const result = await runListIssues(
			{ state: 'open', labels: ['bug'], limit: 10 },
			options,
		);

		expect(result.isError).toBeUndefined();
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(true);
		expect(body.tier).toBe('rest-authed');
		expect(body.issues).toHaveLength(1);
		expect(body.issues[0].number).toBe(42);
		expect(receivedOpts).toEqual({
			state: 'open',
			labels: ['bug'],
			limit: 10,
		});
	});

	it('omits undefined fields from the forwarded options (no spurious keys)', async () => {
		let receivedOpts: IListIssuesOptions | undefined;
		const options: IListIssuesToolOptions = {
			namespacePrefix: 'issues',
			githubClient: fakeClient(async (opts) => {
				receivedOpts = opts;
				return { issues: [], tier: 'gh' };
			}),
		};

		await runListIssues({}, options);

		expect(receivedOpts).toEqual({});
	});

	it('wraps a thrown error from the client into a tool error envelope', async () => {
		const options: IListIssuesToolOptions = {
			namespacePrefix: 'issues',
			githubClient: fakeClient(async () => {
				throw new Error('network down');
			}),
		};

		const result = await runListIssues({}, options);

		expect(result.isError).toBe(true);
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(false);
		expect(body.error.reason).toContain('network down');
	});
});
