import { describe, expect, it } from 'vitest';

import { parsePrShow } from './pr-show';

describe('parsePrShow', async () => {
	it('parses GitHub PR detail and flattens commits', async () => {
		const parsed = parsePrShow({
			number: 12,
			title: 'Add forge plugin',
			body: 'body',
			author: { login: 'octo' },
			headRefName: 'feat/forge',
			baseRefName: 'develop',
			state: 'OPEN',
			url: 'https://github.com/foo/bar/pull/12',
			additions: 10,
			deletions: 2,
			changedFiles: 3,
			reviewDecision: 'APPROVED',
			commits: [
				{
					commit: {
						oid: 'abc123',
						messageHeadline: 'feat: add forge',
						authors: [{ login: 'octo' }],
						authoredDate: '2026-07-24T00:00:00Z',
					},
				},
			],
			comments: { nodes: [{}, {}] },
			statusCheckRollup: [
				{
					name: 'test',
					status: 'COMPLETED',
					conclusion: 'SUCCESS',
					detailsUrl: 'https://example.com/check/1',
				},
			],
			labels: [{ name: 'plugin' }],
		});
		expect(parsed.commits[0]).toEqual({
			sha: 'abc123',
			message: 'feat: add forge',
			author: 'octo',
			authoredAt: '2026-07-24T00:00:00Z',
		});
		expect(parsed.comments).toBe(2);
	});

	it('parses GitLab MR detail', async () => {
		const parsed = parsePrShow({
			iid: 9,
			title: 'Fix pipeline',
			description: 'details',
			author: { username: 'gl-user' },
			source_branch: 'fix/pipeline',
			target_branch: 'main',
			state: 'opened',
			web_url: 'https://gitlab.com/foo/bar/-/merge_requests/9',
			changes_count: 4,
			review_status: 'review_required',
			comments: 1,
		});
		expect(parsed.number).toBe(9);
		expect(parsed.author).toBe('gl-user');
		expect(parsed.changedFiles).toBe(4);
	});
});
