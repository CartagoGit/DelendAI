import { describe, expect, it } from 'vitest';

import type { IRunExternalToolInput } from '@mcp-vertex/core/public';

import {
	buildForgeSearchToolRegistrations,
	runForgeSearchCode,
} from '../../../../src/lib/tools/forge-search.tool';
import type { IForgeSearchExec } from '../../../../src/lib/contracts/interfaces/forge-search.interface';

type ToolHandler = (
	args?: unknown,
) => Promise<{ structuredContent?: Record<string, unknown> }>;

const fakeExec: IForgeSearchExec = async (input: IRunExternalToolInput) => {
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
	if (input.tool.bin === 'gh' && input.args[0] === 'search') {
		return {
			ok: true,
			code: 0,
			stdout: JSON.stringify([
				{
					path: 'plugins/forge/src/lib/tools/forge-search.tool.ts',
					repository: { fullName: 'CartagoGit/mcp-vertex' },
					textMatches: [
						{ fragment: "registerTool('forge_search_code'" },
					],
				},
			]),
			stderr: '',
			timedOut: false,
			unavailable: false,
		};
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
} as const;

const capture = async (toolId: string): Promise<ToolHandler> => {
	let handler: ToolHandler | undefined;
	const server = {
		registerTool(name: string, _config: unknown, fn: ToolHandler): void {
			if (name === toolId) handler = fn;
		},
	};
	for (const registration of buildForgeSearchToolRegistrations(options)) {
		await registration.register(
			server as unknown as Parameters<typeof registration.register>[0],
		);
	}
	if (handler === undefined) throw new Error(`tool ${toolId} not registered`);
	return handler;
};

describe('forge search tool', () => {
	it('builds the search registration', () => {
		expect(
			buildForgeSearchToolRegistrations(options).map((tool) => tool.id),
		).toEqual(['search_code']);
	});

	it('runs forge_search_code directly', async () => {
		const result = await runForgeSearchCode(
			{ query: 'registerTool' },
			options,
		);
		const body = result.structuredContent as {
			ok: boolean;
			hits: { path: string }[];
		};
		expect(body.ok).toBe(true);
		expect(body.hits[0]?.path).toContain('forge-search.tool.ts');
	});

	it('registers forge_search_code under the prefixed name', async () => {
		const handler = await capture('forge_search_code');
		const result = await handler({ query: 'registerTool' });
		const body = result.structuredContent as {
			ok: boolean;
			hits: { repository: string }[];
		};
		expect(body.ok).toBe(true);
		expect(body.hits[0]?.repository).toBe('CartagoGit/mcp-vertex');
	});
});
