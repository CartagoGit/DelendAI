/**
 * refused-server.ts — what a host sees when the workspace cannot start.
 *
 * A server that refuses to start writes the reason to stderr and exits.
 * Hosts discard a child's stderr, so the person saw "MCP error -32000:
 * Connection closed" and nothing that said which rule was broken or how
 * to fix it. The refusal is the most useful thing the server knows at
 * that moment.
 *
 * So the server still answers the handshake. Its instructions ARE the
 * refusal and its remedy, which every host shows or hands to the model,
 * and it serves one tool that returns the same text. It serves nothing
 * else: the workspace is not usable until the configuration is fixed,
 * and pretending otherwise would let work start under a policy that
 * cannot be honoured.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { REFUSED_SERVER_TOOL } from './refused-server.constant';

const HEADER =
	'delendai cannot start in this workspace, so no other tool is available. Fix the configuration below, then restart the server.';

const REFUSAL_OUTPUT = z.object({
	started: z.literal(false),
	refusal: z.string(),
});

export const refusalInstructions = (refusal: string): string =>
	`${HEADER}\n\n${refusal}`;

/** The server, unconnected: tests attach their own transport. */
export const createRefusedServer = (refusal: string): McpServer => {
	const server = new McpServer(
		{ name: 'DelendAI', title: 'DelendAI (not started)', version: '0.0.0' },
		{ instructions: refusalInstructions(refusal) },
	);
	server.registerTool(
		REFUSED_SERVER_TOOL,
		{
			title: 'Why delendai did not start',
			description:
				'Why the server refused to start in this workspace and what to change. Read-only.',
			inputSchema: z.object({}),
			outputSchema: REFUSAL_OUTPUT,
		},
		async () => ({
			content: [
				{ type: 'text' as const, text: refusalInstructions(refusal) },
			],
			structuredContent: { started: false as const, refusal },
		}),
	);
	return server;
};

/** Answer the host's handshake with the refusal, over stdio. */
export const serveRefusal = async (refusal: string): Promise<void> => {
	await createRefusedServer(refusal).connect(new StdioServerTransport());
};
