import { describe, expect, it } from 'vitest';

import type {
	IExternalToolRun,
	IRunExternalToolInput,
} from '@mcp-vertex/core/public';

import { createRelease } from '../../../../src/lib/services/forge-release';
import type { IForgeReleaseExec } from '../../../../src/lib/contracts/interfaces/forge-release.interface';

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
	(): IForgeReleaseExec => async (input: IRunExternalToolInput) => {
		if (input.tool.bin === 'git') {
			return okRun('git@github.com:CartagoGit/mcp-vertex.git\n');
		}
		if (
			input.tool.bin === 'gh' &&
			input.args[0] === 'release' &&
			input.args[1] === 'create'
		) {
			expect(input.args).toContain('v0.1.0');
			expect(input.args).toContain('--notes');
			return okRun(
				'https://github.com/CartagoGit/mcp-vertex/releases/tag/v0.1.0\n',
			);
		}
		if (
			input.tool.bin === 'gh' &&
			input.args[0] === 'release' &&
			input.args[1] === 'view'
		) {
			return okRun(
				JSON.stringify({
					url: 'https://github.com/CartagoGit/mcp-vertex/releases/tag/v0.1.0',
					id: '44',
					name: 'v0.1.0',
					tagName: 'v0.1.0',
					isDraft: false,
					isPrerelease: false,
				}),
			);
		}
		return failRun(
			`unexpected call: ${input.tool.bin} ${input.args.join(' ')}`,
		);
	};

const gitlabExec =
	(): IForgeReleaseExec => async (input: IRunExternalToolInput) => {
		if (input.tool.bin === 'git') {
			return okRun('git@gitlab.com:CartagoGit/mcp-vertex.git\n');
		}
		if (
			input.tool.bin === 'glab' &&
			input.args[0] === 'release' &&
			input.args[1] === 'create'
		) {
			return okRun(
				'https://gitlab.com/CartagoGit/mcp-vertex/-/releases/v0.1.0\n',
			);
		}
		if (
			input.tool.bin === 'glab' &&
			input.args[0] === 'release' &&
			input.args[1] === 'view'
		) {
			return okRun(
				JSON.stringify({
					web_url:
						'https://gitlab.com/CartagoGit/mcp-vertex/-/releases/v0.1.0',
					id: '55',
					tag_name: 'v0.1.0',
					name: 'v0.1.0',
				}),
			);
		}
		return failRun(
			`unexpected call: ${input.tool.bin} ${input.args.join(' ')}`,
		);
	};

describe('forge release service', () => {
	it('creates a release and returns its metadata', async () => {
		const result = await createRelease(
			'/repo',
			{ tag: 'v0.1.0', notes: 'Ship forge S3', confirm: true },
			githubExec(),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.tag).toBe('v0.1.0');
		expect(result.url).toContain('/releases/tag/v0.1.0');
	});

	it('refuses release creation without confirm:true', async () => {
		const result = await createRelease(
			'/repo',
			{ tag: 'v0.1.0', confirm: false },
			githubExec(),
		);
		expect(result).toEqual({
			ok: false,
			error: { reason: 'confirm: true required' },
		});
	});

	it('rejects empty tag names', async () => {
		const result = await createRelease(
			'/repo',
			{ tag: '', confirm: true },
			githubExec(),
		);
		expect(result).toEqual({
			ok: false,
			error: { reason: 'tag is required' },
		});
	});

	it('passes inline notes through to the create command', async () => {
		const calls: string[][] = [];
		const exec: IForgeReleaseExec = async (
			input: IRunExternalToolInput,
		) => {
			if (input.tool.bin === 'git') {
				return okRun('git@github.com:CartagoGit/mcp-vertex.git\n');
			}
			if (input.args[0] === 'release' && input.args[1] === 'create') {
				calls.push([...input.args]);
				return okRun(
					'https://github.com/CartagoGit/mcp-vertex/releases/tag/v0.2.0\n',
				);
			}
			if (input.args[0] === 'release' && input.args[1] === 'view') {
				return okRun(
					JSON.stringify({
						url: 'https://github.com/CartagoGit/mcp-vertex/releases/tag/v0.2.0',
						id: '45',
						tagName: 'v0.2.0',
						name: 'v0.2.0',
						isDraft: false,
						isPrerelease: false,
					}),
				);
			}
			return failRun(`unexpected: ${input.args.join(' ')}`);
		};
		const result = await createRelease(
			'/repo',
			{
				tag: 'v0.2.0',
				notes: 'Ship forge S3',
				confirm: true,
			},
			exec,
		);
		expect(result.ok).toBe(true);
		expect(calls[0]).toContain('--notes');
		expect(calls[0]).toContain('Ship forge S3');
	});

	it('returns a structured failure when the forge call fails', async () => {
		const exec: IForgeReleaseExec = async (
			input: IRunExternalToolInput,
		) => {
			if (input.tool.bin === 'git') {
				return okRun('git@github.com:CartagoGit/mcp-vertex.git\n');
			}
			return failRun('gh release create failed');
		};
		const result = await createRelease(
			'/repo',
			{ tag: 'v0.1.0', confirm: true },
			exec,
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.provider).toBe('github');
		expect(result.error.reason).toContain('gh release create failed');
	});

	it('creates a GitLab release through glab', async () => {
		const result = await createRelease(
			'/repo',
			{ tag: 'v0.1.0', confirm: true },
			gitlabExec(),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.provider).toBe('gitlab');
		expect(result.tag).toBe('v0.1.0');
	});
});
