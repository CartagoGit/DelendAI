import { describe, expect, it } from 'vitest';

import type { IRunExternalToolInput } from '@mcp-vertex/core/public';

import {
	buildForgeReleaseToolRegistrations,
	runForgeRelease,
} from '../../../../src/lib/tools/forge-release.tool';
import type { IForgeReleaseExec } from '../../../../src/lib/contracts/interfaces/forge-release.interface';

type ToolHandler = (
	args?: unknown,
) => Promise<{ structuredContent?: Record<string, unknown> }>;

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
	if (input.tool.bin === 'gh' && input.args[1] === 'create') {
		return {
			ok: true,
			code: 0,
			stdout: 'https://github.com/CartagoGit/mcp-vertex/releases/tag/v0.1.0\n',
			stderr: '',
			timedOut: false,
			unavailable: false,
		};
	}
	return {
		ok: true,
		code: 0,
		stdout: JSON.stringify({
			url: 'https://github.com/CartagoGit/mcp-vertex/releases/tag/v0.1.0',
			name: 'v0.1.0',
			tagName: 'v0.1.0',
			isDraft: false,
			isPrerelease: false,
		}),
		stderr: '',
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
	for (const registration of buildForgeReleaseToolRegistrations(options)) {
		await registration.register(
			server as unknown as Parameters<typeof registration.register>[0],
		);
	}
	if (handler === undefined) throw new Error(`tool ${toolId} not registered`);
	return handler;
};

describe('forge release tool', () => {
	it('builds the release registration', () => {
		expect(
			buildForgeReleaseToolRegistrations(options).map((tool) => tool.id),
		).toEqual(['release']);
	});

	it('enforces confirm:true and succeeds with it', async () => {
		const denied = await runForgeRelease(
			{ tag: 'v0.1.0', confirm: false },
			options,
		);
		expect(denied.structuredContent).toEqual({
			ok: false,
			error: { reason: 'confirm: true required' },
		});

		const allowed = await runForgeRelease(
			{ tag: 'v0.1.0', notes: 'Ship forge S3', confirm: true },
			options,
		);
		const body = allowed.structuredContent as { ok: boolean; tag: string };
		expect(body.ok).toBe(true);
		expect(body.tag).toBe('v0.1.0');
	});

	it('registers forge_release under the prefixed name', async () => {
		const handler = await capture('forge_release');
		const result = await handler({
			tag: 'v0.1.0',
			notes: 'Ship forge S3',
			confirm: true,
		});
		const body = result.structuredContent as { ok: boolean; url: string };
		expect(body.ok).toBe(true);
		expect(body.url).toContain('/releases/tag/v0.1.0');
	});
});
