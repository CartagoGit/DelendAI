/**
 * The example is self-verifying: this spec proves the plugin honours the
 * mcp-vertex contract (registers a tool + knowledge, and the tool produces the
 * documented payload). Examples that aren't tested rot — this one can't.
 */
import { describe, expect, it } from 'vitest';

import type {
	IMcpPluginContext,
	IToolRegistration,
} from '@mcp-vertex/core/public';

import plugin from '../src/index';

// A minimal in-memory MCP server that just captures the registered handlers,
// so we can invoke a tool without spinning up a transport.
type IToolHandler = (args: Record<string, unknown>) => Promise<{
	content: Array<{ type: string; text: string }>;
	structuredContent?: Record<string, unknown>;
}>;

const fakeContext = (
	options: Record<string, unknown> = {},
): IMcpPluginContext =>
	({
		workspace: { root: '/ws', resolve: (p: string) => `/ws/${p}` },
		corePaths: {
			cacheDir: '.cache/mcp-vertex',
			docsDir: 'docs/mcp-vertex',
		},
		cacheDir: '.cache/mcp-vertex',
		docsDir: 'docs/mcp-vertex',
		keepLegacy: false,
		pluginCacheDir: '.cache/mcp-vertex/example-wordcount',
		pluginDocsDir: 'docs/mcp-vertex/example-wordcount',
		namespacePrefix: 'demo',
		options,
		args: {},
	}) satisfies IMcpPluginContext;

const registerAndCapture = async (
	ctx: IMcpPluginContext,
): Promise<{
	toolIds: string[];
	handlers: Map<string, IToolHandler>;
	knowledgeIds: string[];
}> => {
	const reg = await plugin.register(ctx);
	const handlers = new Map<string, IToolHandler>();
	const fakeServer = {
		registerTool: (name: string, _cfg: unknown, handler: IToolHandler) =>
			handlers.set(name, handler),
	};
	for (const tool of (reg.tools ?? []) as IToolRegistration[]) {
		await tool.register(fakeServer as never);
	}
	return {
		toolIds: ((reg.tools ?? []) as IToolRegistration[]).map((t) => t.id),
		handlers,
		knowledgeIds: (reg.knowledge ?? []).map((k) => k.id),
	};
};

describe('example wordcount plugin', () => {
	it('registers the wordcount tool + a knowledge entry', async () => {
		const { toolIds, knowledgeIds, handlers } = await registerAndCapture(
			fakeContext(),
		);
		expect(toolIds).toEqual(['wordcount']);
		expect(knowledgeIds).toEqual(['example-wordcount']);
		expect([...handlers.keys()]).toEqual(['demo_wordcount']);
	});

	it('counts words and characters (compact structuredContent)', async () => {
		const { handlers } = await registerAndCapture(fakeContext());
		const result = await handlers.get('demo_wordcount')!({
			text: 'hello, brave new world',
		});
		expect(result.structuredContent).toEqual({ words: 4, chars: 22 });
	});

	it('honours the splitOnPunctuation option', async () => {
		const { handlers } = await registerAndCapture(
			fakeContext({ splitOnPunctuation: false }),
		);
		const result = await handlers.get('demo_wordcount')!({ text: 'a,b c' });
		// punctuation NOT a boundary → "a,b" and "c" = 2 words
		expect(result.structuredContent).toMatchObject({ words: 2 });
	});
});
