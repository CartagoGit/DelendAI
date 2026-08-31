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

	// MUY-ALTA #1: schema/handler drift regression tests. These guarantee
	// that every input field the Zod schema accepts reaches `gh release
	// create`. Prior to the fix, `notesFile`/`target`/`prerelease`/`draft`
	// were silently dropped, so a user passing `prerelease: true` got a
	// normal release. Tests assert each flag ends up as the right CLI arg.

	it('forwards --notes when notes is non-empty', async () => {
		const observedArgs: string[][] = [];
		const exec: IForgeReleaseExec = async (input) => {
			if (input.tool.bin === 'git')
				return okRun('git@github.com:CartagoGit/mcp-vertex.git\n');
			observedArgs.push(input.args.slice());
			if (input.args[0] === 'release' && input.args[1] === 'create')
				return okRun('');
			return okRun(
				'{"url":"https://example/r","id":"1","name":"r","tagName":"v1.0.0","isDraft":false,"isPrerelease":false}',
			);
		};
		await createRelease(
			'/repo',
			{ tag: 'v1.0.0', notes: 'hello', confirm: true },
			exec,
		);
		const create = observedArgs.find(
			(a) => a[0] === 'release' && a[1] === 'create',
		);
		expect(create).toContain('v1.0.0');
		expect(create).toContain('--notes');
		expect(create).toContain('hello');
	});

	it('forwards --notes-file when notesFile is non-empty', async () => {
		const observedArgs: string[][] = [];
		const exec: IForgeReleaseExec = async (input) => {
			if (input.tool.bin === 'git')
				return okRun('git@github.com:CartagoGit/mcp-vertex.git\n');
			observedArgs.push(input.args.slice());
			if (input.args[0] === 'release' && input.args[1] === 'create')
				return okRun('');
			return okRun(
				'{"url":"https://example/r","id":"1","name":"r","tagName":"v1.0.0","isDraft":false,"isPrerelease":false}',
			);
		};
		await createRelease(
			'/repo',
			{ tag: 'v1.0.0', notesFile: 'CHANGELOG.md', confirm: true },
			exec,
		);
		const create = observedArgs.find(
			(a) => a[0] === 'release' && a[1] === 'create',
		);
		expect(create).toContain('--notes-file');
		expect(create).toContain('CHANGELOG.md');
		expect(create).not.toContain('--notes');
	});

	it('forwards --target when target is non-empty', async () => {
		const observedArgs: string[][] = [];
		const exec: IForgeReleaseExec = async (input) => {
			if (input.tool.bin === 'git')
				return okRun('git@github.com:CartagoGit/mcp-vertex.git\n');
			observedArgs.push(input.args.slice());
			if (input.args[0] === 'release' && input.args[1] === 'create')
				return okRun('');
			return okRun(
				'{"url":"https://example/r","id":"1","name":"r","tagName":"v1.0.0","isDraft":false,"isPrerelease":false}',
			);
		};
		await createRelease(
			'/repo',
			{ tag: 'v1.0.0', target: 'main', confirm: true },
			exec,
		);
		const create = observedArgs.find(
			(a) => a[0] === 'release' && a[1] === 'create',
		);
		expect(create).toContain('--target');
		expect(create).toContain('main');
	});

	it('forwards --draft when draft:true', async () => {
		const observedArgs: string[][] = [];
		const exec: IForgeReleaseExec = async (input) => {
			if (input.tool.bin === 'git')
				return okRun('git@github.com:CartagoGit/mcp-vertex.git\n');
			observedArgs.push(input.args.slice());
			if (input.args[0] === 'release' && input.args[1] === 'create')
				return okRun('');
			return okRun(
				'{"url":"https://example/r","id":"1","name":"r","tagName":"v1.0.0","isDraft":true,"isPrerelease":false}',
			);
		};
		const result = await createRelease(
			'/repo',
			{ tag: 'v1.0.0', draft: true, confirm: true },
			exec,
		);
		const create = observedArgs.find(
			(a) => a[0] === 'release' && a[1] === 'create',
		);
		expect(create).toContain('--draft');
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.draft).toBe(true);
	});

	it('forwards --prerelease when prerelease:true', async () => {
		const observedArgs: string[][] = [];
		const exec: IForgeReleaseExec = async (input) => {
			if (input.tool.bin === 'git')
				return okRun('git@github.com:CartagoGit/mcp-vertex.git\n');
			observedArgs.push(input.args.slice());
			if (input.args[0] === 'release' && input.args[1] === 'create')
				return okRun('');
			return okRun(
				'{"url":"https://example/r","id":"1","name":"r","tagName":"v1.0.0","isDraft":false,"isPrerelease":true}',
			);
		};
		const result = await createRelease(
			'/repo',
			{ tag: 'v1.0.0', prerelease: true, confirm: true },
			exec,
		);
		const create = observedArgs.find(
			(a) => a[0] === 'release' && a[1] === 'create',
		);
		expect(create).toContain('--prerelease');
		if (result.ok) expect(result.prerelease).toBe(true);
	});

	it('rejects notes + notesFile (mutually exclusive)', async () => {
		let createCalled = false;
		const exec: IForgeReleaseExec = async (input) => {
			if (input.tool.bin === 'git')
				return okRun('git@github.com:CartagoGit/mcp-vertex.git\n');
			if (input.args[0] === 'release' && input.args[1] === 'create') {
				createCalled = true;
				return okRun('');
			}
			return okRun('');
		};
		const result = await createRelease(
			'/repo',
			{
				tag: 'v1.0.0',
				notes: 'a',
				notesFile: 'CHANGELOG.md',
				confirm: true,
			},
			exec,
		);
		expect(result.ok).toBe(false);
		if (!result.ok)
			expect(result.error.reason).toContain('mutually exclusive');
		expect(createCalled).toBe(false);
	});

	// ALTA #14: numeric `id` from gh release view (real shape is number,
	// not string — covered by `trimOrEmpty`).
	it('accepts numeric id from gh release view', async () => {
		const exec: IForgeReleaseExec = async (input) => {
			if (input.tool.bin === 'git')
				return okRun('git@github.com:CartagoGit/mcp-vertex.git\n');
			if (input.args[0] === 'release' && input.args[1] === 'create')
				return okRun('');
			return okRun(
				'{"url":"https://example/r","id":12345,"name":"v1.0.0","tagName":"v1.0.0","isDraft":false,"isPrerelease":false}',
			);
		};
		const result = await createRelease(
			'/repo',
			{ tag: 'v1.0.0', confirm: true },
			exec,
		);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.id).toBe('12345');
	});

	it('falls back to stderr when gh release view writes JSON there', async () => {
		const exec: IForgeReleaseExec = async (input) => {
			if (input.tool.bin === 'git')
				return okRun('git@github.com:CartagoGit/mcp-vertex.git\n');
			if (input.args[0] === 'release' && input.args[1] === 'create')
				return okRun('');
			// Some gh versions route --json to stderr
			return {
				ok: true,
				code: 0,
				stdout: '',
				stderr: '{"url":"https://example/r","id":"9","name":"v1.0.0","tagName":"v1.0.0","isDraft":false,"isPrerelease":false}',
				timedOut: false,
				unavailable: false,
			};
		};
		const result = await createRelease(
			'/repo',
			{ tag: 'v1.0.0', confirm: true },
			exec,
		);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.id).toBe('9');
	});
});
