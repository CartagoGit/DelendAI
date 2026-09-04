import { describe, expect, it } from 'vitest';

import type { IRunExternalToolInput } from '@delendai/core/public';

import {
	buildForgeReleaseToolRegistrations,
	runForgeRelease,
} from '../../../../src/lib/tools/forge-release.tool';
import type { IForgeReleaseExec } from '../../../../src/lib/contracts/interfaces/forge-release.interface';

const fakeExec: IForgeReleaseExec = async (input: IRunExternalToolInput) => {
	if (input.tool.bin === 'git') {
		return {
			ok: true,
			code: 0,
			stdout: 'git@github.com:CartagoGit/mcp-vertex.git\n',
			stderr: '',
			timedOut: false,
			unavailable: false,
		};
	}
	const joined = input.args.join(' ');
	if (joined.startsWith('release create')) {
		return {
			ok: true,
			code: 0,
			stdout: '',
			stderr: '',
			timedOut: false,
			unavailable: false,
		};
	}
	if (joined.startsWith('release view')) {
		return {
			ok: true,
			code: 0,
			stdout: JSON.stringify({
				url: 'https://github.com/CartagoGit/mcp-vertex/releases/tag/v1.0.0',
				id: 12345,
				name: 'v1.0.0',
				tagName: 'v1.0.0',
				isDraft: false,
				isPrerelease: false,
			}),
			stderr: '',
			timedOut: false,
			unavailable: false,
		};
	}
	return {
		ok: false,
		code: 1,
		stdout: '',
		stderr: `unexpected call: ${input.tool.bin} ${joined}`,
		timedOut: false,
		unavailable: false,
	};
};

const options = {
	namespacePrefix: 'forge',
	workspaceRootAbs: '/repo',
	forgeExec: fakeExec,
} as const;

describe('forge release tool', () => {
	it('builds the single release registration', () => {
		expect(
			buildForgeReleaseToolRegistrations(options).map((tool) => tool.id),
		).toEqual(['release']);
	});

	it('refuses to run forge_release without confirm:true', async () => {
		const denied = await runForgeRelease({ tag: 'v1.0.0' }, options);
		expect(denied.structuredContent).toEqual({
			ok: false,
			error: { reason: 'confirm: true required' },
		});
	});

	it('runs forge_release end-to-end and returns the bounded release envelope', async () => {
		const result = await runForgeRelease(
			{ tag: 'v1.0.0', notes: 'first release', confirm: true },
			options,
		);
		expect(result.structuredContent).toEqual({
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

	it('registers the tool under the namespaced id', async () => {
		let registeredName: string | undefined;
		const server = {
			registerTool(name: string): void {
				registeredName = name;
			},
		};
		for (const registration of buildForgeReleaseToolRegistrations(
			options,
		)) {
			await registration.register(
				server as unknown as Parameters<
					typeof registration.register
				>[0],
			);
		}
		expect(registeredName).toBe('forge_release');
	});
});
