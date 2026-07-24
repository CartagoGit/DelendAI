import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import { analyzeSessionHygiene } from '../session-hygiene';
import { readInvocations } from '../rollup';
import type { ISessionHygienePolicy, ISessionHygieneSnapshot } from '../types';

const ReasonSchema = z.enum(['session-age', 'idle-gap', 'mcp-output-volume']);
const SnapshotSchema = z.object({
	sessionId: z.string(),
	observedMcpOnly: z.literal(true),
	firstActivityAt: z.string(),
	lastActivityAt: z.string(),
	observedElapsedMs: z.number(),
	largestIdleGapMs: z.number(),
	calls: z.number(),
	responseBytes: z.number(),
	estimatedMcpOutputTokens: z.number(),
	reasons: z.array(ReasonSchema),
});

export interface ISessionHygieneToolOptions {
	readonly namespacePrefix: string;
	readonly invocationsPath: string;
	readonly policy: ISessionHygienePolicy;
	readonly currentSessions: () => readonly ISessionHygieneSnapshot[];
	readonly onServer?: ((server: McpServer) => void) | undefined;
}

/** Report durable and current local MCP-session hygiene without host guesses. */
export const buildSessionHygieneToolRegistration = (
	options: ISessionHygieneToolOptions,
): IToolRegistration => ({
	id: 'session_hygiene',
	tags: ['usage-tracking', 'token-efficiency', 'lazy'],
	summary:
		'Report local MCP session age, idle gaps and response-volume pressure.',
	descriptionKey: 'usage-tracking_session_hygiene',
	register: async (server) => {
		options.onServer?.(server);
		server.registerTool(
			`${options.namespacePrefix}_session_hygiene`,
			{
				description:
					'Report session hygiene from local MCP invocation metadata only: observed activity span, largest gap between tool calls, response bytes and estimated MCP-output tokens. It does not know the host conversation, private context meter, or subscription quota. Returns newest sessions first and flags configured local thresholds; use an advisory to checkpoint, compact relevant work, or begin a fresh host session.',
				inputSchema: z.object({
					limit: z.number().int().positive().max(100).optional(),
				}),
				outputSchema: z.object({
					observedMcpOnly: z.literal(true),
					policy: z.object({
						maxSessionAgeMs: z.number(),
						maxIdleGapMs: z.number(),
						maxMcpOutputTokens: z.number(),
					}),
					current: z.array(SnapshotSchema),
					sessions: z.array(SnapshotSchema),
				}),
			},
			async (args: { limit?: number | undefined }) => {
				const limit = args.limit ?? 20;
				const records = await readInvocations(options.invocationsPath);
				return toolJson({
					observedMcpOnly: true as const,
					policy: options.policy,
					current: options.currentSessions().slice(0, limit),
					sessions: analyzeSessionHygiene(
						records,
						options.policy,
					).slice(0, limit),
				});
			},
		);
	},
});
