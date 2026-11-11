/**
 * forge-gitlab.spec.ts — the read service over glab: a merge request, a
 * pipeline with its jobs and failing trace, issues with their notes,
 * and the ways a glab call can fail.
 */
import { describe, expect, it } from 'vitest';

import type {
	IExternalToolRun,
	IRunExternalToolInput,
} from '@delendai/core/contracts';

import {
	getCiStatus,
	listIssues,
	showIssue,
	showPullRequest,
} from '../../../../src/lib/services/forge';
import type { IForgeExec } from '../../../../src/lib/contracts/interfaces/forge-read.interface';

const run = (ok: boolean, stdout: string, stderr = ''): IExternalToolRun => ({
	ok,
	code: ok ? 0 : 1,
	stdout,
	stderr,
	timedOut: false,
	unavailable: false,
});

const json = (value: unknown): string => JSON.stringify(value);

/** glab answering by subcommand; anything else is an unexpected call. */
const glab =
	(answers: Readonly<Record<string, IExternalToolRun>>): IForgeExec =>
	async (input: IRunExternalToolInput) => {
		if (input.tool.bin === 'git')
			return run(true, 'git@gitlab.com:o/r.git\n');
		const joined = input.args.join(' ');
		const key = Object.keys(answers).find((prefix) =>
			joined.startsWith(prefix),
		);
		return key === undefined
			? run(false, '', `unexpected: ${joined}`)
			: (answers[key] ?? run(false, ''));
	};

describe('GitLab merge request detail', () => {
	it('reads the pipeline, merge status and review decision', async () => {
		const exec = glab({
			'mr view': run(
				true,
				json({
					iid: 4,
					title: 'feat: gitlab',
					source_branch: 'feat/gitlab',
					web_url: 'https://gitlab.com/o/r/-/merge_requests/4',
					work_in_progress: true,
					author: { username: 'octolab' },
					labels: ['backend'],
					state: 'opened',
					detailed_merge_status: 'mergeable',
					review_decision: 'approved',
					pipeline: { status: 'failed', web_url: 'https://p/1' },
				}),
			),
		});
		const result = await showPullRequest('/repo', '4', exec);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.pr).toMatchObject({
			number: 4,
			branch: 'feat/gitlab',
			draft: true,
			mergeable: 'mergeable',
			reviewDecision: 'approved',
		});
	});

	it('fails with the remediation when glab fails without JSON', async () => {
		const result = await showPullRequest(
			'/repo',
			'4',
			glab({ 'mr view': run(false, '', 'HTTP 401') }),
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.reason).toContain('401');
		expect(result.error.remediation).toContain('glab auth login');
	});
});

describe('GitLab pipelines', () => {
	it('hydrates each pipeline with its jobs and the failed job trace', async () => {
		const exec = glab({
			'ci list': run(
				true,
				json([
					{
						id: 77,
						ref: 'main',
						status: 'failed',
						web_url: 'https://p/77',
						created_at: '2026-10-01T00:00:00Z',
						updated_at: '2026-10-01T00:10:00Z',
					},
				]),
			),
			'ci view': run(
				true,
				json({
					jobs: [
						{
							id: 9,
							stage: 'test',
							status: 'failed',
							started_at: '2026-10-01T00:01:00Z',
							finished_at: '2026-10-01T00:05:00Z',
							web_url: 'https://j/9',
						},
						{ id: 10, name: 'lint', status: 'success' },
					],
				}),
			),
			'ci trace 9': run(true, 'FAIL spec\n'),
		});
		const result = await getCiStatus('/repo', 5, exec);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const [pipeline] = result.data.runs;
		expect(pipeline).toMatchObject({
			id: '77',
			branch: 'main',
			createdAt: '2026-10-01T00:00:00Z',
			updatedAt: '2026-10-01T00:10:00Z',
			failingLog: 'FAIL spec',
		});
		expect(pipeline?.jobs[0]).toMatchObject({
			name: 'test',
			startedAt: '2026-10-01T00:01:00Z',
			completedAt: '2026-10-01T00:05:00Z',
			url: 'https://j/9',
		});
	});

	it('reads a bare job list, and keeps a pipeline whose detail failed', async () => {
		const listed = glab({
			'ci list': run(true, json([{ id: 5, status: 'success' }])),
			'ci view': run(
				true,
				json([
					{
						id: 1,
						name: 'build',
						status: 'success',
						started_at: 'a',
						finished_at: 'b',
						web_url: 'u',
					},
				]),
			),
		});
		const bare = await getCiStatus('/repo', 5, listed);
		expect(bare.ok && bare.data.runs[0]?.jobs[0]).toMatchObject({
			startedAt: 'a',
			completedAt: 'b',
			url: 'u',
		});
		const failing = glab({
			'ci list': run(true, json([{ id: 5, status: 'success' }])),
			'ci view': run(false, '', 'gone'),
		});
		const kept = await getCiStatus('/repo', 5, failing);
		expect(kept.ok && kept.data.runs[0]?.jobs).toEqual([]);
	});
});

describe('GitLab issues', () => {
	it('lists issues and shows one with its notes', async () => {
		const exec = glab({
			'issue list': run(
				true,
				json([
					{
						iid: 3,
						title: 'bug',
						state: 'opened',
						web_url: 'https://i/3',
						author: { username: 'a' },
						labels: ['bug'],
					},
				]),
			),
			'issue view': run(
				true,
				json({
					iid: 3,
					title: 'bug',
					state: 'opened',
					web_url: 'https://i/3',
					description: 'what broke',
					notes: [
						{
							author: { username: 'b' },
							note: 'seen it',
							created_at: '2026-10-02T00:00:00Z',
							web_url: 'https://i/3#note_1',
						},
					],
				}),
			),
		});
		const list = await listIssues('/repo', 'closed', 10, exec);
		expect(list.ok && list.data.issues[0]?.number).toBe(3);
		const detail = await showIssue('/repo', '3', exec);
		expect(detail.ok).toBe(true);
		if (!detail.ok) return;
		expect(detail.data.issue.body).toBe('what broke');
		expect(detail.data.issue.comments[0]).toMatchObject({
			body: 'seen it',
			createdAt: '2026-10-02T00:00:00Z',
			url: 'https://i/3#note_1',
		});
	});

	it('is not an issue when glab answers something that is not one', async () => {
		const detail = await showIssue(
			'/repo',
			'3',
			glab({ 'issue view': run(true, '[]') }),
		);
		expect(detail.ok).toBe(false);
	});
});
