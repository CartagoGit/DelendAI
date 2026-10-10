import { describe, expect, it } from 'vitest';

import { parseIssueShow } from './issue-show';

describe('parseIssueShow', async () => {
	it('parses GitHub issue detail', async () => {
		const parsed = parseIssueShow({
			number: 4,
			title: 'Broken build',
			body: 'details',
			state: 'OPEN',
			author: { login: 'octo' },
			labels: [{ name: 'bug' }],
			comments: [
				{
					author: { login: 'reviewer' },
					body: 'please fix',
					createdAt: '2026-07-24T02:00:00Z',
					url: 'https://github.com/foo/bar/issues/4#issuecomment-1',
				},
			],
			url: 'https://github.com/foo/bar/issues/4',
			createdAt: '2026-07-24T00:00:00Z',
			updatedAt: '2026-07-24T01:00:00Z',
		});
		expect(parsed.comments[0]?.author).toBe('reviewer');
	});

	it('parses GitLab issue detail', async () => {
		const parsed = parseIssueShow({
			iid: 8,
			title: 'Need docs',
			description: 'write more docs',
			state: 'opened',
			author: { username: 'gl-user' },
			labels: ['docs'],
			notes: [
				{
					user: { username: 'maintainer' },
					note: 'ack',
					created_at: '2026-07-24T02:00:00Z',
					web_url: 'https://gitlab.com/foo/bar/-/issues/8#note_1',
				},
			],
			web_url: 'https://gitlab.com/foo/bar/-/issues/8',
			created_at: '2026-07-24T00:00:00Z',
			updated_at: '2026-07-24T01:00:00Z',
		});
		expect(parsed.author).toBe('gl-user');
		expect(parsed.comments[0]?.author).toBe('maintainer');
	});
});
