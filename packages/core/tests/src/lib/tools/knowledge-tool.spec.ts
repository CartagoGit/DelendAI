/**
 * knowledge-tool.spec.ts — the `knowledge` tool's two modes: a cheap list
 * of ids and branded titles (never bodies), and one entry by id.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';

import type { IKnowledgeEntry } from '@delendai/core/lib/contracts/interfaces/knowledge.interface';
import type { IToolSurfaceRuntimeAccess } from '@delendai/core/lib/contracts/interfaces/tool-surface.interface';
import { buildKnowledgeToolRegistration } from '@delendai/core/lib/tools/knowledge-tool';

const ENTRIES: readonly IKnowledgeEntry[] = [
	{ id: 'core-orientation', title: 'Orientation', body: 'Start here.' },
	{
		id: 'core-branded',
		title: 'DelendAI Branded',
		body: 'Already carries the brand.',
	},
];

const NO_RUNTIME: IToolSurfaceRuntimeAccess = {
	get: () => undefined,
	bind: () => undefined,
};

type Handler = (args: {
	readonly id?: string;
	readonly includeToolDocs?: boolean;
}) => Promise<{
	readonly isError?: boolean;
	readonly structuredContent?: Record<string, unknown>;
}>;

const serve = async (
	runtimeAccess?: IToolSurfaceRuntimeAccess,
): Promise<Handler> => {
	const registerTool = vi.fn();
	const server = { registerTool } as Pick<
		McpServer,
		'registerTool'
	> as McpServer;
	await buildKnowledgeToolRegistration(
		'delendai',
		() => ENTRIES,
		runtimeAccess,
	).register(server);
	return registerTool.mock.calls[0]?.[2] as Handler;
};

const BRANDED_LIST = [
	{ id: 'core-orientation', title: 'DelendAI Orientation' },
	{ id: 'core-branded', title: 'DelendAI Branded' },
];

describe('knowledge tool', () => {
	it('lists ids and branded titles only, never bodies', async () => {
		const handler = await serve();

		const result = await handler({});

		expect(result.structuredContent?.entries).toEqual(BRANDED_LIST);
	});

	it('lists the same entries when tool docs are requested without a runtime', async () => {
		expect(
			(await (await serve())({ includeToolDocs: true })).structuredContent
				?.entries,
		).toEqual(BRANDED_LIST);
	});

	it('lists the same entries when the runtime is not up yet', async () => {
		const handler = await serve(NO_RUNTIME);

		const result = await handler({ includeToolDocs: true });

		expect(result.structuredContent?.entries).toEqual(BRANDED_LIST);
	});

	it('returns one entry with its body and branded title', async () => {
		const handler = await serve(NO_RUNTIME);

		const result = await handler({ id: 'core-orientation' });

		expect(result.isError).toBeFalsy();
		expect(result.structuredContent).toEqual({
			id: 'core-orientation',
			title: 'DelendAI Orientation',
			body: 'Start here.',
		});
	});

	it('refuses an unknown id, with or without a runtime to ask', async () => {
		expect((await (await serve())({ id: 'missing' })).isError).toBe(true);
		expect(
			(await (await serve(NO_RUNTIME))({ id: 'missing' })).isError,
		).toBe(true);
	});
});
