import { describe, expect, it } from 'vitest';

import type {
	IExternalToolRun,
	IRunExternalToolInput,
} from '@delendai/core/public';

import {
	buildPrBody,
	commentOnPr,
	createIssue,
	createPr,
	readProposalMarkdown,
} from '../../../../src/lib/services/forge-write';
import type { IForgeWriteExec } from '../../../../src/lib/contracts/interfaces/forge-write.interface';

const okRun = (stdout: string, stderr = ''): IExternalToolRun => ({
	ok: true,
	code: 0,
	stdout,
	stderr,
	timedOut: false,
	unavailable: false,
});

const failRun = (stderr: string): IExternalToolRun => ({
	ok: false,
	code: 1,
	stdout: '',
	stderr,
	timedOut: false,
	unavailable: false,
});

const githubExec =
	(): IForgeWriteExec => async (input: IRunExternalToolInput) => {
		if (input.tool.bin === 'git' && input.args[0] === 'remote') {
			return okRun('git@github.com:CartagoGit/mcp-vertex.git\n');
		}
		if (input.tool.bin === 'git' && input.args[0] === 'log') {
			return okRun(
				'feat(f00121): add forge write surface\nfix(f00121): tighten confirm gate\n',
			);
		}
		if (input.tool.bin === 'gh' && input.args[0] === 'api') {
			const path = input.args[1];
			if (path === 'repos/CartagoGit/mcp-vertex/pulls') {
				return okRun(
					JSON.stringify({
						number: 21,
						title: 'feat(f00121): forge plugin write surface (S2)',
						html_url:
							'https://github.com/CartagoGit/mcp-vertex/pull/21',
						draft: true,
					}),
				);
			}
			if (path === 'repos/CartagoGit/mcp-vertex/issues/21/comments') {
				return okRun(
					JSON.stringify({
						id: 1,
						html_url:
							'https://github.com/CartagoGit/mcp-vertex/pull/21#issuecomment-1',
						body: 'Looks good',
					}),
				);
			}
			if (path === 'repos/CartagoGit/mcp-vertex/issues') {
				return okRun(
					JSON.stringify({
						number: 77,
						title: 'forge write follow-up',
						html_url:
							'https://github.com/CartagoGit/mcp-vertex/issues/77',
						labels: [{ name: 'triage' }, { name: 'forge' }],
					}),
				);
			}
		}
		return failRun(
			`unexpected call: ${input.tool.bin} ${input.args.join(' ')}`,
		);
	};

describe('forge write service', () => {
	it('builds a PR body from description, proposal and commits', () => {
		const body = buildPrBody({
			title: 'feat(f00121): forge plugin write surface (S2)',
			description: 'Implements the write surface.',
			proposalId: 'f00121-forge-plugin',
			proposalMarkdown: '# Proposal\n\nText',
			commits: ['feat(f00121): add service', 'test(f00121): add specs'],
		});
		expect(body).toContain(
			'# feat(f00121): forge plugin write surface (S2)',
		);
		expect(body).toContain('## Linked Proposal');
		expect(body).toContain('Source: f00121-forge-plugin');
		expect(body).toContain('- feat(f00121): add service');
	});

	it('looks up a proposal markdown document across lifecycle folders', async () => {
		const reads: string[] = [];
		const readFile = async (path: string): Promise<string> => {
			reads.push(path);
			if (path.endsWith('/review/f00121-forge-plugin.md')) {
				return '# Proposal\n';
			}
			throw new Error('missing');
		};
		const markdown = await readProposalMarkdown(
			'/repo',
			'f00121-forge-plugin',
			readFile,
		);
		expect(markdown).toBe('# Proposal\n');
		expect(
			reads.some((path) =>
				path.endsWith('/review/f00121-forge-plugin.md'),
			),
		).toBe(true);
	});

	// x00168 (S5): `proposalId` used to reach a bare `path.join` with zero
	// containment check — a caller could read any `.md` file outside
	// docs/mcp-vertex/proposals/ via `../` traversal, and its content
	// would be embedded verbatim into a PR body posted to the real,
	// public origin forge by `createPr`.
	it('refuses a proposalId containing path traversal', async () => {
		const reads: string[] = [];
		const readFile = async (path: string): Promise<string> => {
			reads.push(path);
			return '# should never be reached\n';
		};
		const markdown = await readProposalMarkdown(
			'/repo',
			'../../../../outside/secret',
			readFile,
		);
		expect(markdown).toBeUndefined();
		expect(reads).toHaveLength(0);
	});

	it('refuses a proposalId containing a path separator', async () => {
		const reads: string[] = [];
		const readFile = async (path: string): Promise<string> => {
			reads.push(path);
			return '# should never be reached\n';
		};
		const markdown = await readProposalMarkdown(
			'/repo',
			'foo/bar',
			readFile,
		);
		expect(markdown).toBeUndefined();
		expect(reads).toHaveLength(0);
	});

	it('creates a PR with proposal-aware body assembly', async () => {
		const result = await createPr(
			'/repo',
			{
				title: 'feat(f00121): forge plugin write surface (S2)',
				body: 'Implements PR create/comment + issue create.',
				base: 'develop',
				head: 'agent/copilot-minimax-m3-f00121-s2',
				draft: true,
				confirm: true,
				proposalId: 'f00121-forge-plugin',
			},
			githubExec(),
			async () => '# Proposal\n\nS2 body',
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.pr.number).toBe(21);
		expect(result.data.pr.body).toContain('## Linked Proposal');
		expect(result.data.pr.body).toContain(
			'feat(f00121): add forge write surface',
		);
	});

	it('comments on a PR via the injected exec', async () => {
		const result = await commentOnPr(
			'/repo',
			{ number: 21, body: 'Looks good', confirm: true },
			githubExec(),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.comment.number).toBe(21);
		expect(result.data.comment.url).toContain('issuecomment');
	});

	it('creates an issue and preserves labels from the response', async () => {
		const result = await createIssue(
			'/repo',
			{
				title: 'forge write follow-up',
				body: 'Track follow-up work.',
				labels: ['triage', 'forge'],
				confirm: true,
			},
			githubExec(),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.issue.labels).toEqual(['triage', 'forge']);
	});

	it('refuses PR creation without confirm:true', async () => {
		const result = await createPr(
			'/repo',
			{ title: 'feat: x', confirm: false },
			githubExec(),
		);
		expect(result).toEqual({
			ok: false,
			error: { reason: 'confirm: true required' },
		});
	});
});
