/**
 * The client's bootstrap prompt says how to work in the words the server
 * sent when it connected (f00751): the server reads the project's
 * `core.agentPolicy`, and the client does not.
 */
import { describe, expect, it } from 'vitest';

import { AgentCatalogService } from '../../src/lib/services/agent-catalog-service';
import { McpStdioClient } from '../../src/lib/transport/mcp-stdio-client';

const catalog = {
	tools: [],
	skills: [],
	proposals: [
		{
			id: 'f00001',
			title: 'Ready',
			track: 'hosts',
			status: 'ready',
			kind: 'feat',
		},
	],
	counts: {},
};

const service = (instructions?: string) =>
	new AgentCatalogService(
		McpStdioClient.fromTransport({
			async callTool() {
				return { structuredContent: catalog, content: [] };
			},
			...(instructions === undefined
				? {}
				: { getInstructions: () => instructions }),
		}),
	);

describe('the client bootstrap prompt', () => {
	it('carries the server instructions', async () => {
		const text = await service(
			'Working mode: autonomous. Decide and carry on.',
		).getBootstrapPrompt();
		expect(text.startsWith('Working mode: autonomous.')).toBe(true);
		expect(text).toContain('Actionable proposals: f00001');
	});

	it('states no policy of its own when the server sent none', async () => {
		const text = await service().getBootstrapPrompt();
		expect(text).not.toContain('Working mode');
		expect(text).toContain('delendai_overview');
	});
});
