import { describe, expect, it } from 'vitest';

import type { IRunExternalToolInput } from '@mcp-vertex/core/public';

import {
	buildForgeWriteToolRegistrations,
	runForgeIssueCreate,
	runForgeMcpVertexIssueCreate,
	runForgePrComment,
	runForgePrCreate,
} from '../../../../src/lib/tools/forge-write.tool';
import type { IForgeWriteExec } from '../../../../src/lib/contracts/interfaces/forge-write.interface';
import { REPOSITORY_SLUG } from '@mcp-vertex/core/public';

type ToolHandler = (
	args?: unknown,
) => Promise<{ structuredContent?: Record<string, unknown> }>;

const fakeExec: IForgeWriteExec = async (input: IRunExternalToolInput) => {
	if (input.tool.bin === 'git' && input.args[0] === 'remote') {
		return {
			ok: true,
			code: 0,
			stdout: 'git@github.com:CartagoGit/mcp-vertex.git\n',
			stderr: '',
			timedOut: false,
			unavailable: false,
		};
	}
	if (input.tool.bin === 'git' && input.args[0] === 'log') {
		return {
			ok: true,
			code: 0,
			stdout: 'feat(f00121): add forge write surface\n',
			stderr: '',
			timedOut: false,
			unavailable: false,
		};
	}
	if (input.tool.bin === 'gh' && input.args[0] === 'api') {
		const path = input.args[1];
		if (path === 'repos/CartagoGit/mcp-vertex/pulls') {
			return {
				ok: true,
				code: 0,
				stdout: JSON.stringify({
					number: 10,
					title: 'feat(f00121): forge plugin write surface (S2)',
					html_url:
						'https://github.com/CartagoGit/mcp-vertex/pull/10',
					draft: false,
				}),
				stderr: '',
				timedOut: false,
				unavailable: false,
			};
		}
		if (path === 'repos/CartagoGit/mcp-vertex/issues/10/comments') {
			return {
				ok: true,
				code: 0,
				stdout: JSON.stringify({
					html_url:
						'https://github.com/CartagoGit/mcp-vertex/pull/10#issuecomment-2',
					body: 'hello',
				}),
				stderr: '',
				timedOut: false,
				unavailable: false,
			};
		}
		// Any repository: this stub serves BOTH destinations, and they are
		// no longer the same. An issue about the consuming project goes to
		// its own repo (from the git-remote fixture); an issue about this
		// tool goes to the canonical one. Pinning the stub to either made
		// the other test miss its handler.
		if (/^repos\/[^/]+\/[^/]+\/issues$/u.test(path)) {
			return {
				ok: true,
				code: 0,
				stdout: JSON.stringify({
					number: 42,
					title: 'forge issue',
					html_url:
						'https://github.com/CartagoGit/mcp-vertex/issues/42',
					labels: [{ name: 'triage' }],
				}),
				stderr: '',
				timedOut: false,
				unavailable: false,
			};
		}
	}
	return {
		ok: false,
		code: 1,
		stdout: '',
		stderr: `unexpected call: ${input.tool.bin} ${input.args.join(' ')}`,
		timedOut: false,
		unavailable: false,
	};
};

const options = {
	namespacePrefix: 'forge',
	workspaceRootAbs: '/repo',
	forgeExec: fakeExec,
	proposalReadFile: async () => '# Proposal\n',
} as const;

const capture = async (toolId: string): Promise<ToolHandler> => {
	let handler: ToolHandler | undefined;
	const server = {
		registerTool(name: string, _config: unknown, fn: ToolHandler): void {
			if (name === toolId) handler = fn;
		},
	};
	for (const registration of buildForgeWriteToolRegistrations(options)) {
		await registration.register(
			server as unknown as Parameters<typeof registration.register>[0],
		);
	}
	if (handler === undefined) throw new Error(`tool ${toolId} not registered`);
	return handler;
};

describe('forge write tools', () => {
	it('builds the three write registrations', () => {
		expect(
			buildForgeWriteToolRegistrations(options).map((tool) => tool.id),
		).toEqual([
			'pr_create',
			'pr_comment',
			'issue_create',
			'mcp_vertex_issue_create',
		]);
	});

	it('refuses forge_pr_create without confirm:true and succeeds with it', async () => {
		const denied = await runForgePrCreate({ title: 'feat: x' }, options);
		expect(denied.structuredContent).toEqual({
			ok: false,
			error: { reason: 'confirm: true required' },
		});
		const allowed = await runForgePrCreate(
			{
				title: 'feat(f00121): forge plugin write surface (S2)',
				base: 'develop',
				confirm: true,
				proposalId: 'f00121-forge-plugin',
			},
			options,
		);
		const body = allowed.structuredContent as {
			ok: boolean;
			data: { pr: { number: number; body: string } };
		};
		expect(body.ok).toBe(true);
		expect(body.data.pr.number).toBe(10);
		expect(body.data.pr.body).toContain('## Linked Proposal');
	});

	it('refuses forge_pr_comment without confirm:true and succeeds with it', async () => {
		const denied = await runForgePrComment(
			{ number: 10, body: 'hello' },
			options,
		);
		expect(denied.structuredContent).toEqual({
			ok: false,
			error: { reason: 'confirm: true required' },
		});
		const allowed = await runForgePrComment(
			{ number: 10, body: 'hello', confirm: true },
			options,
		);
		const body = allowed.structuredContent as {
			ok: boolean;
			data: { comment: { number: number } };
		};
		expect(body.ok).toBe(true);
		expect(body.data.comment.number).toBe(10);
	});

	it('refuses forge_issue_create without confirm:true and succeeds with it', async () => {
		const denied = await runForgeIssueCreate(
			{ title: 'forge issue' },
			options,
		);
		expect(denied.structuredContent).toEqual({
			ok: false,
			error: { reason: 'confirm: true required' },
		});
		const allowed = await runForgeIssueCreate(
			{ title: 'forge issue', labels: ['triage'], confirm: true },
			options,
		);
		const body = allowed.structuredContent as {
			ok: boolean;
			data: { issue: { number: number; labels: string[] } };
		};
		expect(body.ok).toBe(true);
		expect(body.data.issue.number).toBe(42);
		expect(body.data.issue.labels).toEqual(['triage']);
	});

	it('posts mcp-vertex issues to the canonical repository', async () => {
		const calls: string[][] = [];
		const exec: IForgeWriteExec = async (input) => {
			calls.push([...input.args]);
			if (input.tool.bin !== 'gh') {
				throw new Error(
					'internal issue creation must not inspect origin',
				);
			}
			return {
				ok: true,
				code: 0,
				stdout: JSON.stringify({
					number: 99,
					title: 'internal failure',
					html_url:
						'https://github.com/CartagoGit/mcp-vertex/issues/99',
					labels: [{ name: 'bug' }],
				}),
				stderr: '',
				timedOut: false,
				unavailable: false,
			};
		};
		const result = await runForgeMcpVertexIssueCreate(
			{ title: 'internal failure', confirm: true },
			{ ...options, forgeExec: exec },
		);
		const body = result.structuredContent as {
			ok: boolean;
			data: { issue: { url: string } };
		};
		expect(body.ok).toBe(true);
		expect(body.data.issue.url).toContain(
			'https://github.com/CartagoGit/mcp-vertex/issues/99',
		);
		expect(calls).toHaveLength(1);
		expect(calls[0]).toContain(`repos/${REPOSITORY_SLUG}/issues`);
	});

	it('registers forge_pr_comment under the prefixed name', async () => {
		const handler = await capture('forge_pr_comment');
		const result = await handler({
			number: 10,
			body: 'hello',
			confirm: true,
		});
		const body = result.structuredContent as {
			ok: boolean;
			data: { comment: { url?: string } };
		};
		expect(body.ok).toBe(true);
		expect(body.data.comment.url).toContain('issuecomment');
	});
});
