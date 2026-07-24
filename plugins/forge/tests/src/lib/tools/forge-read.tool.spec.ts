import { describe, expect, it } from 'vitest';

import type { IRunExternalToolInput } from '@mcp-vertex/core/public';

import {
	buildForgeReadToolRegistrations,
	runForgeCiStatus,
	runForgeIssueShow,
	runForgePrList,
} from '../../../../src/lib/tools/forge-read.tool';
import type { IForgeExec } from '../../../../src/lib/contracts/interfaces/forge-read.interface';

type ToolHandler = (
	args?: unknown,
) => Promise<{ structuredContent?: Record<string, unknown> }>;

const fakeExec: IForgeExec = async (input: IRunExternalToolInput) => {
	if (input.tool.bin === 'git')
		return {
			ok: true,
			code: 0,
			stdout: 'git@github.com:CartagoGit/mcp-vertex.git\n',
			stderr: '',
			timedOut: false,
			unavailable: false,
		};
	const joined = input.args.join(' ');
	if (joined.includes('pr list'))
		return {
			ok: true,
			code: 0,
			stdout: JSON.stringify([
				{
					number: 1,
					title: 'stub pr',
					headRefName: 'feat/stub',
					url: 'https://github.com/o/r/pull/1',
					isDraft: false,
					author: { login: 'octocat' },
					labels: [],
					statusCheckRollup: [],
				},
			]),
			stderr: '',
			timedOut: false,
			unavailable: false,
		};
	if (joined.includes('run list'))
		return {
			ok: true,
			code: 0,
			stdout: JSON.stringify([
				{
					databaseId: 91,
					displayTitle: 'CI',
					headBranch: 'feat/stub',
					status: 'completed',
					conclusion: 'success',
					url: 'https://github.com/o/r/actions/runs/91',
					workflowName: 'ci',
				},
			]),
			stderr: '',
			timedOut: false,
			unavailable: false,
		};
	if (joined.includes('run view 91 --json jobs,url'))
		return {
			ok: true,
			code: 0,
			stdout: JSON.stringify({ jobs: [] }),
			stderr: '',
			timedOut: false,
			unavailable: false,
		};
	if (joined.includes('issue view'))
		return {
			ok: true,
			code: 0,
			stdout: JSON.stringify({
				number: 5,
				title: 'stub issue',
				state: 'OPEN',
				url: 'https://github.com/o/r/issues/5',
				author: { login: 'octocat' },
				labels: [{ name: 'triage' }],
				body: 'Issue body',
				comments: [],
			}),
			stderr: '',
			timedOut: false,
			unavailable: false,
		};
	return {
		ok: false,
		code: 1,
		stdout: '',
		stderr: `unexpected call: ${joined}`,
		timedOut: false,
		unavailable: false,
	};
};

const options = {
	namespacePrefix: 'forge',
	workspaceRootAbs: '/repo',
	forgeExec: fakeExec,
} as const;

const capture = async (toolId: string): Promise<ToolHandler> => {
	let handler: ToolHandler | undefined;
	const server = {
		registerTool(name: string, _config: unknown, fn: ToolHandler): void {
			if (name === toolId) handler = fn;
		},
	};
	for (const registration of buildForgeReadToolRegistrations(options)) {
		await registration.register(
			server as unknown as Parameters<typeof registration.register>[0],
		);
	}
	if (handler === undefined) throw new Error(`tool ${toolId} not registered`);
	return handler;
};

describe('forge read tools', () => {
	it('builds the five read registrations', () => {
		expect(
			buildForgeReadToolRegistrations(options).map((tool) => tool.id),
		).toEqual([
			'pr_list',
			'pr_show',
			'ci_status',
			'issue_list',
			'issue_show',
		]);
	});
	it('runs forge_pr_list through the injected exec', async () => {
		const result = await runForgePrList(options);
		const body = result.structuredContent as {
			ok: boolean;
			provider: string;
			data: { prs: { number: number }[] };
		};
		expect(body.ok).toBe(true);
		expect(body.data.prs[0]?.number).toBe(1);
	});
	it('registers forge_ci_status under the prefixed name', async () => {
		const handler = await capture('forge_ci_status');
		const result = await handler({ limit: 1 });
		const body = result.structuredContent as {
			ok: boolean;
			data: { runs: { id: string }[] };
		};
		expect(body.ok).toBe(true);
		expect(body.data.runs[0]?.id).toBe('91');
	});
	it('runs forge_issue_show and returns the detail envelope', async () => {
		const result = await runForgeIssueShow({ issue: 5 }, options);
		const body = result.structuredContent as {
			ok: boolean;
			data: { issue: { title: string; labels: string[] } };
		};
		expect(body.ok).toBe(true);
		expect(body.data.issue.labels).toEqual(['triage']);
	});
	it('runs forge_ci_status directly', async () => {
		const result = await runForgeCiStatus({ limit: 1 }, options);
		const body = result.structuredContent as {
			ok: boolean;
			data: { runs: { workflow: string }[] };
		};
		expect(body.ok).toBe(true);
		expect(body.data.runs[0]?.workflow).toBe('ci');
	});
});
