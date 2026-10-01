import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { compactOutputSchema, toolJson } from '@delendai/core/public';

import { analyzeSessionHygiene } from '../session-hygiene';
import { readInvocations } from '../rollup';
import {
	readHostLifecycleEvents,
	summarizeHostLifecycle,
} from '../host-lifecycle';
import type {
	IObservedHostSession,
	ISessionHygienePolicy,
	ISessionHygieneSnapshot,
} from '../types';

export interface ISessionHygieneToolOptions {
	readonly namespacePrefix: string;
	readonly invocationsPath: string;
	readonly hostLifecyclePath: string;
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
				outputSchema: compactOutputSchema(),
			},
			async (args: { limit?: number | undefined }) => {
				const limit = args.limit ?? 20;
				const [records, lifecycleEvents] = await Promise.all([
					readInvocations(options.invocationsPath),
					readHostLifecycleEvents(options.hostLifecyclePath),
				]);
				const hostSessions: IObservedHostSession[] =
					summarizeHostLifecycle(lifecycleEvents, records).slice(
						0,
						limit,
					);
				return toolJson({
					observedMcpOnly: true as const,
					hostLifecycle: {
						observedHostOnly: true as const,
						source: 'claude-code-command-hooks' as const,
						sessions: hostSessions,
					},
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
