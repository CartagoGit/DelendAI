import { describe, expect, it } from 'vitest';

import {
	runFetchIssue,
	type IFetchIssueToolOptions,
} from '../../../../src/lib/tools/fetch-issue.tool';
import type { IGithubClient } from '../../../../src/lib/tools/list-issues.tool';
import type { IFetchIssueResult } from '../../../../src/lib/github-client';

const STUB_RESULT: IFetchIssueResult = {
	data: {
		number: 7,
		title: 'Crash on startup',
		state: 'open',
		labels: ['bug'],
		author: 'octocat',
		url: 'https://github.com/o/r/issues/7',
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
		commentsCount: 1,
		body: 'It crashes.',
		comments: [
			{
				author: 'reviewer',
				body: 'Can repro.',
				createdAt: '2026-01-02T00:00:00Z',
				url: 'https://github.com/o/r/issues/7#issuecomment-1',
			},
		],
	},
	comments: [
		{
			author: 'reviewer',
			body: 'Can repro.',
			createdAt: '2026-01-02T00:00:00Z',
			url: 'https://github.com/o/r/issues/7#issuecomment-1',
		},
	],
	tier: 'gh',
};

describe('issues_fetch', () => {
	it('delegates to the injected client and returns issue + comments', async () => {
		let receivedNumber: number | undefined;
		const githubClient: IGithubClient = {
			fetchIssue: async (number) => {
				receivedNumber = number;
				return STUB_RESULT;
			},
			listIssues: async () => ({ issues: [], tier: 'gh' }),
		};
		const options: IFetchIssueToolOptions = {
			namespacePrefix: 'issues',
			githubClient,
		};

		const result = await runFetchIssue({ number: 7 }, options);

		expect(result.isError).toBeUndefined();
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(true);
		expect(body.issue.number).toBe(7);
		expect(body.issue.title).toBe('Crash on startup');
		expect(body.comments).toHaveLength(1);
		expect(receivedNumber).toBe(7);
	});

	it('wraps a thrown error from the client into a tool error envelope', async () => {
		const githubClient: IGithubClient = {
			fetchIssue: async () => {
				throw new Error('issue not found');
			},
			listIssues: async () => ({ issues: [], tier: 'gh' }),
		};
		const options: IFetchIssueToolOptions = {
			namespacePrefix: 'issues',
			githubClient,
		};

		const result = await runFetchIssue({ number: 999 }, options);

		expect(result.isError).toBe(true);
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(false);
		expect(body.error.reason).toContain('issue not found');
	});
});
