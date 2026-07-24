import { describe, expect, it } from 'vitest';

import type {
	IExternalToolRun,
	IRunExternalToolInput,
} from '@mcp-vertex/core/public';

import { searchCode } from '../../../../src/lib/services/forge-search';
import type { IForgeSearchExec } from '../../../../src/lib/contracts/interfaces/forge-search.interface';

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
	(): IForgeSearchExec => async (input: IRunExternalToolInput) => {
		if (input.tool.bin === 'git') {
			return okRun('git@github.com:CartagoGit/mcp-vertex.git\n');
		}
		if (input.tool.bin === 'gh' && input.args[0] === 'search') {
			expect(input.args).toContain('code');
			expect(input.args.join(' ')).toContain('language:ts');
			expect(input.args.join(' ')).toContain(
				'repo:CartagoGit/mcp-vertex',
			);
			return okRun(
				JSON.stringify([
					{
						path: 'plugins/forge/src/index.ts',
						repository: { fullName: 'CartagoGit/mcp-vertex' },
						textMatches: [
							{ fragment: "definePlugin({ name: 'forge' })" },
						],
					},
				]),
			);
		}
		return failRun(
			`unexpected call: ${input.tool.bin} ${input.args.join(' ')}`,
		);
	};

const gitlabExec =
	(): IForgeSearchExec => async (input: IRunExternalToolInput) => {
		if (input.tool.bin === 'git') {
			return okRun('git@gitlab.com:CartagoGit/mcp-vertex.git\n');
		}
		if (input.tool.bin === 'glab' && input.args[0] === 'search') {
			expect(input.args).toContain('code');
			return okRun(
				JSON.stringify([
					{
						path: 'plugins/forge/src/index.ts',
						project: {
							path_with_namespace: 'CartagoGit/mcp-vertex',
						},
						data: "definePlugin({ name: 'forge' })",
					},
				]),
			);
		}
		return failRun(
			`unexpected call: ${input.tool.bin} ${input.args.join(' ')}`,
		);
	};

describe('forge search service', () => {
	it('searches GitHub code through the injected exec', async () => {
		const result = await searchCode(
			'/repo',
			{
				query: 'definePlugin',
				language: 'ts',
				repo: 'CartagoGit/mcp-vertex',
				limit: 5,
			},
			githubExec(),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.hits[0]).toEqual({
			path: 'plugins/forge/src/index.ts',
			repository: 'CartagoGit/mcp-vertex',
			fragment: "definePlugin({ name: 'forge' })",
		});
	});

	it('rejects an empty query', async () => {
		const result = await searchCode(
			'/repo',
			{ query: '   ' },
			githubExec(),
		);
		expect(result).toEqual({
			ok: false,
			error: { reason: 'query is required' },
		});
	});

	it('uses glab for GitLab code search', async () => {
		const result = await searchCode(
			'/repo',
			{ query: 'definePlugin' },
			gitlabExec(),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.provider).toBe('gitlab');
		expect(result.hits[0]?.repository).toBe('CartagoGit/mcp-vertex');
		expect(result.hits[0]?.path).toBe('plugins/forge/src/index.ts');
	});

	it('uses blob scope for GitLab search', async () => {
		const calls: string[][] = [];
		const exec: IForgeSearchExec = async (input: IRunExternalToolInput) => {
			if (input.tool.bin === 'git') {
				return okRun('git@gitlab.com:CartagoGit/mcp-vertex.git\n');
			}
			if (input.tool.bin === 'glab' && input.args[0] === 'search') {
				calls.push([...input.args]);
				return okRun('[]');
			}
			return failRun(`unexpected: ${input.args.join(' ')}`);
		};
		const result = await searchCode('/repo', { query: 'fix: bug' }, exec);
		expect(result.ok).toBe(true);
		expect(calls[0]).toContain('--scope');
		expect(calls[0]).toContain('blobs');
	});

	it('returns a structured failure when the forge call fails', async () => {
		const exec: IForgeSearchExec = async (input: IRunExternalToolInput) => {
			if (input.tool.bin === 'git') {
				return okRun('git@github.com:CartagoGit/mcp-vertex.git\n');
			}
			return failRun('gh search code failed');
		};
		const result = await searchCode(
			'/repo',
			{ query: 'definePlugin' },
			exec,
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.provider).toBe('github');
		expect(result.error.reason).toContain('gh search code failed');
	});
});
