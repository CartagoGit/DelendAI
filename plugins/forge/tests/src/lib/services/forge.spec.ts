import { describe, expect, it } from 'vitest';

import type {
	IExternalToolRun,
	IRunExternalToolInput,
} from '@delendai/core/public';

import {
	detectForgeProvider,
	getCiStatus,
	listIssues,
	listPullRequests,
	showIssue,
	showPullRequest,
} from '../../../../src/lib/services/forge';
import type { IForgeExec } from '../../../../src/lib/contracts/interfaces/forge-read.interface';

const okRun = (stdout: string, stderr = ''): IExternalToolRun => ({
	ok: true,
	code: 0,
	stdout,
	stderr,
	timedOut: false,
	unavailable: false,
});
const missingRun = (): IExternalToolRun => ({
	ok: false,
	code: 127,
	stdout: '',
	stderr: '',
	timedOut: false,
	unavailable: true,
});
const failRun = (stderr: string): IExternalToolRun => ({
	ok: false,
	code: 1,
	stdout: '',
	stderr,
	timedOut: false,
	unavailable: false,
});

const githubExec = (): IForgeExec => {
	const pulls = JSON.stringify([
		{
			number: 7,
			title: 'feat: add forge plugin',
			headRefName: 'feat/forge',
			url: 'https://github.com/o/r/pull/7',
			isDraft: false,
			author: { login: 'octocat' },
			labels: [{ name: 'feature' }],
			statusCheckRollup: [
				{
					name: 'typecheck',
					status: 'COMPLETED',
					conclusion: 'SUCCESS',
					detailsUrl: 'https://ci/1',
				},
			],
		},
	]);
	const pr = JSON.stringify({
		number: 7,
		title: 'feat: add forge plugin',
		state: 'OPEN',
		url: 'https://github.com/o/r/pull/7',
		headRefName: 'feat/forge',
		isDraft: false,
		author: { login: 'octocat' },
		labels: [{ name: 'feature' }],
		mergeable: 'MERGEABLE',
		reviewDecision: 'APPROVED',
		statusCheckRollup: [
			{
				name: 'typecheck',
				status: 'COMPLETED',
				conclusion: 'SUCCESS',
				detailsUrl: 'https://ci/1',
			},
			{
				name: 'tests',
				status: 'COMPLETED',
				conclusion: 'FAILURE',
				detailsUrl: 'https://ci/2',
			},
		],
	});
	const runs = JSON.stringify([
		{
			databaseId: 1001,
			displayTitle: 'CI',
			headBranch: 'feat/forge',
			status: 'completed',
			conclusion: 'failure',
			url: 'https://github.com/o/r/actions/runs/1001',
			workflowName: 'ci',
			createdAt: '2026-07-24T08:00:00Z',
			updatedAt: '2026-07-24T08:10:00Z',
		},
	]);
	const runDetail = JSON.stringify({
		jobs: [
			{
				databaseId: 1,
				name: 'typecheck',
				status: 'COMPLETED',
				conclusion: 'SUCCESS',
				startedAt: '2026-07-24T08:00:00Z',
				completedAt: '2026-07-24T08:03:00Z',
				url: 'https://ci/job/1',
			},
			{
				databaseId: 2,
				name: 'tests',
				status: 'COMPLETED',
				conclusion: 'FAILURE',
				startedAt: '2026-07-24T08:03:00Z',
				completedAt: '2026-07-24T08:10:00Z',
				url: 'https://ci/job/2',
			},
		],
	});
	const issues = JSON.stringify([
		{
			number: 11,
			title: 'Investigate forge plugin',
			state: 'OPEN',
			url: 'https://github.com/o/r/issues/11',
			author: { login: 'octocat' },
			labels: [{ name: 'bug' }],
		},
	]);
	const issue = JSON.stringify({
		number: 11,
		title: 'Investigate forge plugin',
		state: 'OPEN',
		url: 'https://github.com/o/r/issues/11',
		author: { login: 'octocat' },
		labels: [{ name: 'bug' }],
		body: 'Issue body',
		comments: [
			{
				author: { login: 'reviewer' },
				body: 'First comment',
				createdAt: '2026-07-24T09:00:00Z',
				url: 'https://github.com/o/r/issues/11#issuecomment-1',
			},
		],
	});
	return async (input: IRunExternalToolInput) => {
		if (input.tool.bin === 'git')
			return okRun('git@github.com:CartagoGit/mcp-vertex.git\n');
		const joined = input.args.join(' ');
		if (joined.includes('pr list')) return okRun(pulls);
		if (joined.includes('pr view')) return okRun(pr);
		if (joined.includes('run list')) return okRun(runs);
		if (joined.includes('run view 1001 --json jobs,url'))
			return okRun(runDetail);
		if (joined.includes('run view 1001 --log-failed'))
			return okRun('tests\nAssertionError');
		if (joined.includes('issue list')) return okRun(issues);
		if (joined.includes('issue view')) return okRun(issue);
		return failRun(`unexpected call: ${input.tool.bin} ${joined}`);
	};
};

const gitlabExec = (): IForgeExec => {
	const mergeRequests = JSON.stringify([
		{
			iid: 4,
			title: 'feat: gitlab support',
			source_branch: 'feat/gitlab',
			web_url: 'https://gitlab.com/o/r/-/merge_requests/4',
			draft: true,
			author: { username: 'octolab' },
			labels: ['backend'],
			head_pipeline: {
				status: 'success',
				web_url: 'https://gitlab.com/pipeline/4',
			},
		},
	]);
	return async (input: IRunExternalToolInput) => {
		if (input.tool.bin === 'git')
			return okRun('https://gitlab.com/o/r.git\n');
		if (
			input.args.join(' ') ===
			'mr list --state opened --per-page 50 --output json'
		)
			return okRun(mergeRequests);
		return failRun('unexpected');
	};
};

describe('detectForgeProvider', () => {
	it('detects GitHub from the origin remote', async () => {
		const result = await detectForgeProvider('/repo', githubExec());
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.provider).toBe('github');
	});
	it('returns a remediation when the forge CLI is missing', async () => {
		const exec: IForgeExec = async (input) =>
			input.tool.bin === 'git'
				? okRun('git@github.com:o/r.git')
				: missingRun();
		const result = await listPullRequests('/repo', exec);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.remediation).toContain('gh');
	});
});

describe('GitHub forge service', () => {
	it('lists pull requests with CI summary', async () => {
		const result = await listPullRequests('/repo', githubExec());
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.prs[0]?.ciSummary.total).toBe(1);
	});
	it('shows one pull request with checks and review decision', async () => {
		const result = await showPullRequest('/repo', '7', githubExec());
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.pr.reviewDecision).toBe('APPROVED');
		expect(result.data.pr.ciSummary.failed).toBe(1);
	});
	it('hydrates CI runs with jobs and failing logs', async () => {
		const result = await getCiStatus('/repo', 5, githubExec());
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.runs[0]?.jobs).toHaveLength(2);
		expect(result.data.runs[0]?.failingLog).toContain('AssertionError');
	});
	it('lists and shows issues', async () => {
		const list = await listIssues('/repo', 'open', 20, githubExec());
		expect(list.ok).toBe(true);
		if (!list.ok) return;
		const detail = await showIssue('/repo', '11', githubExec());
		expect(detail.ok).toBe(true);
		if (!detail.ok) return;
		expect(detail.data.issue.comments[0]?.author).toBe('reviewer');
	});
});

describe('GitLab forge service', () => {
	it('normalises merge-request payloads from glab', async () => {
		const result = await listPullRequests('/repo', gitlabExec());
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.prs[0]?.ciSummary.successful).toBe(1);
	});
});
