import { describe, expect, it } from 'vitest';

import { parsePrList } from './pr-list';

describe('parsePrList', async () => {
	it('parses GitHub PR list JSON', async () => {
		const parsed = parsePrList([
			{
				number: 12,
				title: 'Add forge plugin',
				author: { login: 'octo' },
				headRefName: 'feat/forge',
				baseRefName: 'develop',
				url: 'https://github.com/foo/bar/pull/12',
				state: 'OPEN',
				isDraft: true,
				createdAt: '2026-07-24T00:00:00Z',
				updatedAt: '2026-07-24T01:00:00Z',
				labels: [{ name: 'plugin' }],
			},
		]);
		expect(parsed[0]).toEqual({
			number: 12,
			title: 'Add forge plugin',
			author: 'octo',
			branch: 'feat/forge',
			base: 'develop',
			url: 'https://github.com/foo/bar/pull/12',
			state: 'OPEN',
			draft: true,
			createdAt: '2026-07-24T00:00:00Z',
			updatedAt: '2026-07-24T01:00:00Z',
			labels: ['plugin'],
		});
	});

	it('parses GitLab MR list JSON', async () => {
		const parsed = parsePrList([
			{
				iid: 9,
				title: 'Fix pipeline',
				author: { username: 'gitlab-user' },
				source_branch: 'fix/pipeline',
				target_branch: 'main',
				web_url: 'https://gitlab.com/foo/bar/-/merge_requests/9',
				state: 'opened',
				draft: false,
				created_at: '2026-07-24T02:00:00Z',
				updated_at: '2026-07-24T03:00:00Z',
				labels: ['ci'],
			},
		]);
		expect(parsed[0]?.author).toBe('gitlab-user');
		expect(parsed[0]?.branch).toBe('fix/pipeline');
	});
});
