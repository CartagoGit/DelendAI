import { describe, expect, it } from 'vitest';

import type {
	IExternalToolRun,
	IRunExternalToolInput,
} from '@delendai/core/public';

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

const githubExec = (viewStdout: string): IForgeReleaseExec => {
	return async (input: IRunExternalToolInput) => {
		if (input.tool.bin === 'git')
			return okRun('git@github.com:CartagoGit/mcp-vertex.git\n');
		const joined = input.args.join(' ');
		if (joined.startsWith('release create')) return okRun('');
		if (joined.startsWith('release view')) return okRun(viewStdout);
		return failRun(`unexpected call: ${input.tool.bin} ${joined}`);
	};
};

describe('createRelease', () => {
	it('refuses to run without confirm:true', async () => {
		const result = await createRelease(
			'/repo',
			{ tag: 'v1.0.0' },
			githubExec('{}'),
		);
		expect(result).toEqual({
			ok: false,
			error: { reason: 'confirm: true required' },
		});
	});

	it('requires a non-empty tag', async () => {
		const result = await createRelease(
			'/repo',
			{ tag: '  ', confirm: true },
			githubExec('{}'),
		);
		expect(result).toEqual({
			ok: false,
			error: { reason: 'tag is required' },
		});
	});

	// gh's real `--json id,...` returns a numeric id, not a string —
	// regression test for the always-fails-to-parse bug this exposed.
	it('creates a github release and parses the view payload (numeric id, as real gh CLI output shapes it)', async () => {
		const viewPayload = JSON.stringify({
			url: 'https://github.com/CartagoGit/mcp-vertex/releases/tag/v1.0.0',
			id: 12345,
			name: 'v1.0.0',
			tagName: 'v1.0.0',
			isDraft: false,
			isPrerelease: false,
		});
		const result = await createRelease(
			'/repo',
			{ tag: 'v1.0.0', notes: 'first release', confirm: true },
			githubExec(viewPayload),
		);
		expect(result).toEqual({
			ok: true,
			provider: 'github',
			url: 'https://github.com/CartagoGit/mcp-vertex/releases/tag/v1.0.0',
			id: '12345',
			name: 'v1.0.0',
			tag: 'v1.0.0',
			draft: false,
			prerelease: false,
		});
	});

	it('fails when the release view payload is not parseable JSON', async () => {
		const result = await createRelease(
			'/repo',
			{ tag: 'v1.0.0', confirm: true },
			githubExec('not json'),
		);
		expect(result).toEqual({
			ok: false,
			provider: 'github',
			error: {
				reason: 'Could not parse the forge release response payload.',
			},
		});
	});

	it('propagates a failed release create without calling view', async () => {
		const exec: IForgeReleaseExec = async (input) => {
			if (input.tool.bin === 'git')
				return okRun('git@github.com:CartagoGit/mcp-vertex.git\n');
			if (input.args.join(' ').startsWith('release create'))
				return failRun('tag already exists');
			throw new Error('should never reach release view');
		};
		const result = await createRelease(
			'/repo',
			{ tag: 'v1.0.0', confirm: true },
			exec,
		);
		expect(result.ok).toBe(false);
		if (!result.ok)
			expect(result.error.reason).toContain('tag already exists');
	});
});
