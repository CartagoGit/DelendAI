import { describe, expect, it } from 'vitest';

import { parseIssueList } from './issue-list';

describe('parseIssueList', async () => {
	it('parses GitHub issues', async () => {
		const parsed = parseIssueList([
			{
				number: 4,
				title: 'Broken build',
				state: 'OPEN',
				author: { login: 'octo' },
				labels: [{ name: 'bug' }],
				url: 'https://github.com/foo/bar/issues/4',
				createdAt: '2026-07-24T00:00:00Z',
				updatedAt: '2026-07-24T01:00:00Z',
			},
		]);
		expect(parsed[0]?.author).toBe('octo');
	});

	it('parses GitLab issues', async () => {
		const parsed = parseIssueList([
			{
				iid: 8,
				title: 'Need docs',
				state: 'opened',
				author: { username: 'gl-user' },
				labels: ['docs'],
				web_url: 'https://gitlab.com/foo/bar/-/issues/8',
				created_at: '2026-07-24T00:00:00Z',
				updated_at: '2026-07-24T01:00:00Z',
			},
		]);
		expect(parsed[0]?.number).toBe(8);
	});
});
