import { describe, expect, it } from 'vitest';

import { parseCiStatus } from './ci-status';

describe('parseCiStatus', async () => {
	it('keeps all jobs by default', async () => {
		const parsed = parseCiStatus({
			sha: 'abc123',
			runs: [
				{
					databaseId: 7,
					workflowName: 'CI',
					status: 'completed',
					conclusion: 'failure',
					url: 'https://github.com/foo/bar/actions/runs/7',
					createdAt: '2026-07-24T00:00:00Z',
					updatedAt: '2026-07-24T00:10:00Z',
				},
			],
			jobsByRun: {
				'7': {
					jobs: [
						{
							name: 'build',
							status: 'completed',
							conclusion: 'success',
							url: 'https://example.com/build',
						},
						{
							name: 'test',
							status: 'completed',
							conclusion: 'failure',
							url: 'https://example.com/test',
						},
					],
				},
			},
		});
		expect(parsed.runs[0]?.jobs).toHaveLength(2);
	});

	it('filters to failing jobs only when requested', async () => {
		const parsed = parseCiStatus({
			sha: 'abc123',
			failingJobsOnly: true,
			runs: [
				{
					databaseId: 7,
					workflowName: 'CI',
					status: 'completed',
					conclusion: 'failure',
					url: 'https://github.com/foo/bar/actions/runs/7',
					createdAt: '2026-07-24T00:00:00Z',
					updatedAt: '2026-07-24T00:10:00Z',
				},
			],
			jobsByRun: {
				'7': {
					jobs: [
						{
							name: 'build',
							status: 'completed',
							conclusion: 'success',
							url: 'https://example.com/build',
						},
						{
							name: 'test',
							status: 'completed',
							conclusion: 'failure',
							url: 'https://example.com/test',
						},
					],
				},
			},
		});
		expect(parsed.runs[0]?.jobs).toHaveLength(1);
		expect(parsed.runs[0]?.jobs[0]?.name).toBe('test');
	});
});
