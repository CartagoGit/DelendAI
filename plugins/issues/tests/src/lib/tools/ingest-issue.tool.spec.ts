import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	runIngestIssue,
	type IIngestIssueToolOptions,
} from '../../../../src/lib/tools/ingest-issue.tool';
import type { IGithubClient } from '../../../../src/lib/tools/list-issues.tool';
import type { IFetchIssueResult } from '../../../../src/lib/github-client';

const buildFetchResult = (
	number: number,
	overrides: Partial<IFetchIssueResult['data']> = {},
): IFetchIssueResult => ({
	data: {
		number,
		title: 'Crash on startup',
		state: 'open',
		labels: ['bug'],
		author: 'octocat',
		url: `https://github.com/o/r/issues/${number}`,
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
		commentsCount: 0,
		body: 'It crashes every time.',
		comments: [],
		...overrides,
	},
	comments: [],
	tier: 'gh',
});

describe('issues_ingest', async () => {
	let scaffoldDirAbs = '';

	beforeEach(async () => {
		scaffoldDirAbs = await mkdtemp(join(tmpdir(), 'issues-ingest-'));
	});

	afterEach(async () => rm(scaffoldDirAbs, { recursive: true, force: true }));

	it('creates a new scaffold file on first ingest', async () => {
		let fetchCount = 0;
		const githubClient: IGithubClient = {
			fetchIssue: async (number) => {
				fetchCount++;
				return buildFetchResult(number);
			},
			listIssues: async () => ({ issues: [], tier: 'gh' }),
		};
		const options: IIngestIssueToolOptions = {
			namespacePrefix: 'issues',
			githubClient,
			scaffoldDirAbs,
		};

		const result = await runIngestIssue({ number: 1 }, options);

		expect(result.isError).toBeUndefined();
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(true);
		expect(body.alreadyExisted).toBe(false);
		expect(fetchCount).toBe(1);
		expect(body.filePath).toContain('github#1-crash-on-startup.md');

		const files = await readdir(scaffoldDirAbs);
		expect(files).toHaveLength(1);
		const written = await readFile(join(scaffoldDirAbs, files[0]!), 'utf8');
		expect(written).toContain('status: ingested');
		expect(written).toContain('resolution: pending');
		expect(written).toContain('proposals: []');
	});

	it('is idempotent: force:false does not rewrite an existing scaffold', async () => {
		let fetchCount = 0;
		const githubClient: IGithubClient = {
			fetchIssue: async (number) => {
				fetchCount++;
				return buildFetchResult(number);
			},
			listIssues: async () => ({ issues: [], tier: 'gh' }),
		};
		const options: IIngestIssueToolOptions = {
			namespacePrefix: 'issues',
			githubClient,
			scaffoldDirAbs,
		};

		const first = await runIngestIssue({ number: 2 }, options);
		const firstBody = JSON.parse(first.content[0]?.text ?? '{}');

		const second = await runIngestIssue(
			{ number: 2, force: false },
			options,
		);
		const secondBody = JSON.parse(second.content[0]?.text ?? '{}');

		expect(fetchCount).toBe(1);
		expect(secondBody.alreadyExisted).toBe(true);
		expect(secondBody.filePath).toBe(firstBody.filePath);
	});

	it('force:true re-fetches and rewrites the scaffold', async () => {
		let fetchCount = 0;
		const githubClient: IGithubClient = {
			fetchIssue: async (number) => {
				fetchCount++;
				return buildFetchResult(number, {
					title:
						fetchCount === 1 ? 'Original title' : 'Updated title',
				});
			},
			listIssues: async () => ({ issues: [], tier: 'gh' }),
		};
		const options: IIngestIssueToolOptions = {
			namespacePrefix: 'issues',
			githubClient,
			scaffoldDirAbs,
		};

		await runIngestIssue({ number: 3 }, options);
		const second = await runIngestIssue(
			{ number: 3, force: true },
			options,
		);
		const secondBody = JSON.parse(second.content[0]?.text ?? '{}');

		expect(fetchCount).toBe(2);
		expect(secondBody.alreadyExisted).toBe(false);
	});

	it('wraps a thrown error from the client into a tool error envelope', async () => {
		const githubClient: IGithubClient = {
			fetchIssue: async () => {
				throw new Error('issue not found');
			},
			listIssues: async () => ({ issues: [], tier: 'gh' }),
		};
		const options: IIngestIssueToolOptions = {
			namespacePrefix: 'issues',
			githubClient,
			scaffoldDirAbs,
		};

		const result = await runIngestIssue({ number: 999 }, options);

		expect(result.isError).toBe(true);
		const body = JSON.parse(result.content[0]?.text ?? '{}');
		expect(body.ok).toBe(false);
		expect(body.error.reason).toContain('issue not found');
	});
});
