import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { captureToolRegistration } from '../../../../../tools/scripts/lib/test-mcp-server';
import { detectForgeProvider } from '../detect';
import { MissingCliError } from '../exec';
import {
	buildForgeReadToolRegistrations,
	createForgeReadRunner,
} from './forge-read.tool';

const ghPrListJson = JSON.stringify([
	{
		number: 12,
		title: 'Add forge plugin',
		author: { login: 'octo' },
		headRefName: 'feat/forge',
		baseRefName: 'develop',
		url: 'https://github.com/foo/bar/pull/12',
		state: 'OPEN',
		isDraft: false,
		createdAt: '2026-07-24T00:00:00Z',
		updatedAt: '2026-07-24T01:00:00Z',
		labels: [{ name: 'plugin' }],
	},
]);

const ghPrShowJson = JSON.stringify({
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

const ghIssueListJson = JSON.stringify([
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

const ghIssueShowJson = JSON.stringify({
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

const fakeToolOptions = {
	namespacePrefix: 'forge',
	workspaceRootAbs: '/ws',
	detectProvider: async () => 'github' as const,
	runGh: async (args: readonly string[]) => {
		const joined = args.join(' ');
		if (joined.startsWith('pr list')) {
			return {
				stdout: ghPrListJson,
				stderr: '',
				exitCode: 0,
				timedOut: false,
			};
		}
		if (joined.startsWith('pr view')) {
			return {
				stdout: ghPrShowJson,
				stderr: '',
				exitCode: 0,
				timedOut: false,
			};
		}
		if (joined.startsWith('run list')) {
			return {
				stdout: JSON.stringify([
					{
						databaseId: 7,
						headSha: 'abc123',
						workflowName: 'CI',
						status: 'completed',
						conclusion: 'failure',
						url: 'https://github.com/foo/bar/actions/runs/7',
						createdAt: '2026-07-24T00:00:00Z',
						updatedAt: '2026-07-24T00:10:00Z',
					},
				]),
				stderr: '',
				exitCode: 0,
				timedOut: false,
			};
		}
		if (joined.startsWith('run view')) {
			return {
				stdout: JSON.stringify({
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
				}),
				stderr: '',
				exitCode: 0,
				timedOut: false,
			};
		}
		if (joined.startsWith('issue list')) {
			return {
				stdout: ghIssueListJson,
				stderr: '',
				exitCode: 0,
				timedOut: false,
			};
		}
		if (joined.startsWith('issue view')) {
			return {
				stdout: ghIssueShowJson,
				stderr: '',
				exitCode: 0,
				timedOut: false,
			};
		}
		throw new Error(`unexpected command: ${joined}`);
	},
};

describe('forge read tools', async () => {
	it('pr_list parses GitHub JSON correctly', async () => {
		const reg = buildForgeReadToolRegistrations(fakeToolOptions).find(
			(tool) => tool.id === 'pr_list',
		);
		const captured = await captureToolRegistration(reg!);
		const out = (await captured.invoke({})) as {
			ok: boolean;
			items: unknown[];
		};
		expect(out.ok).toBe(true);
		expect(out.items).toHaveLength(1);
	});

	it('pr_show parses GitHub JSON and flattens commits', async () => {
		const reg = buildForgeReadToolRegistrations(fakeToolOptions).find(
			(tool) => tool.id === 'pr_show',
		);
		const captured = await captureToolRegistration(reg!);
		const out = (await captured.invoke({ number: 12 })) as {
			pr: { commits: Array<{ sha: string }> };
		};
		expect(out.pr.commits[0]?.sha).toBe('abc123');
	});

	it('ci_status with failingJobsOnly returns only failing jobs', async () => {
		const reg = buildForgeReadToolRegistrations(fakeToolOptions).find(
			(tool) => tool.id === 'ci_status',
		);
		const captured = await captureToolRegistration(reg!);
		const out = (await captured.invoke({ failingJobsOnly: true })) as {
			status: { runs: Array<{ jobs: Array<{ name: string }> }> };
		};
		expect(out.status.runs[0]?.jobs).toHaveLength(1);
		expect(out.status.runs[0]?.jobs[0]?.name).toBe('test');
	});

	it('issue_list round-trips GitHub JSON', async () => {
		const reg = buildForgeReadToolRegistrations(fakeToolOptions).find(
			(tool) => tool.id === 'issue_list',
		);
		const captured = await captureToolRegistration(reg!);
		const out = (await captured.invoke({})) as {
			items: Array<{ number: number }>;
		};
		expect(out.items[0]?.number).toBe(4);
	});

	it('issue_show round-trips GitHub JSON', async () => {
		const reg = buildForgeReadToolRegistrations(fakeToolOptions).find(
			(tool) => tool.id === 'issue_show',
		);
		const captured = await captureToolRegistration(reg!);
		const out = (await captured.invoke({ number: 4 })) as {
			issue: { comments: Array<{ author: string }> };
		};
		expect(out.issue.comments[0]?.author).toBe('reviewer');
	});

	it('detect auto-detects GitHub and GitLab remotes', async () => {
		const ghDir = await mkdtemp(join(tmpdir(), 'forge-tool-gh-'));
		const glDir = await mkdtemp(join(tmpdir(), 'forge-tool-gl-'));
		try {
			await mkdir(join(ghDir, '.git'));
			await mkdir(join(glDir, '.git'));
			await writeFile(
				join(ghDir, '.git', 'config'),
				`[remote "origin"]\n\turl = git@github.com:foo/bar.git\n`,
			);
			await writeFile(
				join(glDir, '.git', 'config'),
				`[remote "origin"]\n\turl = https://gitlab.com/foo/bar.git\n`,
			);
			expect(await detectForgeProvider(ghDir)).toBe('github');
			expect(await detectForgeProvider(glDir)).toBe('gitlab');
		} finally {
			await rm(ghDir, { recursive: true, force: true });
			await rm(glDir, { recursive: true, force: true });
		}
	});

	it('surfaces MissingCliError through the runner when the CLI is absent', async () => {
		const run = createForgeReadRunner({
			namespacePrefix: 'forge',
			workspaceRootAbs: '/ws',
			detectProvider: async () => 'github',
			runGh: async () => {
				throw new MissingCliError('gh');
			},
		});
		const out = await run({ kind: 'pr_list' });
		expect(out.ok).toBe(false);
		expect(out.hint).toContain('brew install gh');
	});
});
