/**
 * forge-events.tool.ts — a session subscribes to its pull requests and
 * issues, and waits for the forge in one blocking call.
 *
 * `<prefix>_forge_subscribe` records an interest; `work publish` and
 * `work deliver` record the publisher's own pull request without being
 * asked. `<prefix>_forge_await` returns the moment a subscribed outcome
 * arrives (merged, a check done, a label, land's reason, closed), so an
 * agent in standby spends nothing until then. Each outcome is also pushed
 * as an MCP `notifications/message` with `event: "forge-event"`.
 */

import z from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { IToolRegistration } from '@delendai/core/contracts';
import { toolJson } from '@delendai/core/public';
import {
	addForgeEventSubscription,
	forgeEventsDir,
} from '@delendai/core/runtime';

import {
	DEFAULT_FORGE_AWAIT_TIMEOUT_MS,
	FORGE_EVENTS_OFF,
	FORGE_NOTICE_EVENT,
	MAX_FORGE_AWAIT_TIMEOUT_MS,
} from '../contracts/constants/forge-event-bridge.constant';
import { createForgeEventBridge } from '../services/forge-event-bridge';
import { safeSendLoggingMessage } from '../services/safe-logging';
import { attachCloseHandler } from './tools';

import type {
	IForgeEventBridge,
	IForgeEventToolOptions,
} from '../contracts/interfaces/forge-event-bridge.interface';

/** An entry, not the whole notice: the outcome already says what happened. */
const noticeSchema = z.object({
	repository: z.string(),
	number: z.number(),
	outcome: z.string(),
});

/** The bridge of one server, made when its first forge tool registers. */
const bridgeFor = (
	options: IForgeEventToolOptions,
	server: McpServer,
): IForgeEventBridge =>
	createForgeEventBridge({
		dir: forgeEventsDir(options.workspaceRootAbs, options.cacheDir),
		watch: options.watch,
		notify: (notice) => {
			safeSendLoggingMessage(server, {
				level: 'notice',
				logger: 'delendai',
				data: { event: FORGE_NOTICE_EVENT, ...notice },
			});
		},
	});

const clampTimeout = (timeoutMs: number | undefined): number =>
	Math.min(
		Math.max(timeoutMs ?? DEFAULT_FORGE_AWAIT_TIMEOUT_MS, 0),
		MAX_FORGE_AWAIT_TIMEOUT_MS,
	);

/** Both forge tools, sharing one bridge per server. */
export const buildForgeEventRegistrations = (
	options: IForgeEventToolOptions,
): readonly IToolRegistration[] => {
	const bridges = new WeakMap<McpServer, IForgeEventBridge>();
	const bridgeOf = (server: McpServer): IForgeEventBridge => {
		const made = bridges.get(server) ?? bridgeFor(options, server);
		bridges.set(server, made);
		return made;
	};
	const subscribe: IToolRegistration = {
		id: 'forge_subscribe',
		summary:
			'Subscribe this session to a pull request or issue: its outcome arrives as a notification.',
		tags: ['coordination', 'lazy'],
		register: async (server: McpServer) => {
			const bridge = bridgeOf(server);
			server.registerTool(
				`${options.namespacePrefix}_forge_subscribe`,
				{
					description:
						"Subscribe `agent` (your DELENDAI_AGENT_ID) to pull request or issue `number` of `repository` (`owner/name`): its outcomes (merged, closed, a check, a label, land's reason) are pushed to this session. `work publish` subscribes you to your own. Then wait with `forge_await`.",
					inputSchema: z.object({
						agent: z.string().min(1),
						repository: z.string().min(3),
						number: z.number().int().positive(),
					}),
					outputSchema: z.object({
						subscribed: z.boolean(),
						agent: z.string(),
						repository: z.string(),
						number: z.number(),
					}),
				},
				async (args: {
					agent: string;
					repository: string;
					number: number;
				}) => {
					await addForgeEventSubscription(
						forgeEventsDir(
							options.workspaceRootAbs,
							options.cacheDir,
						),
						{ ...args, since: Date.now() },
					);
					await bridge.bind(args.agent);
					return toolJson({ subscribed: true, ...args });
				},
			);
		},
	};
	const wait: IToolRegistration = {
		id: 'forge_await',
		summary:
			'Wait, spending nothing, until the forge reports an outcome on a subscribed pull request or issue.',
		tags: ['coordination', 'lazy'],
		register: async (server: McpServer) => {
			const bridge = bridgeOf(server);
			const pending = new Set<AbortController>();
			attachCloseHandler(server, () => {
				for (const controller of pending) controller.abort();
				bridge.stop();
			});
			server.registerTool(
				`${options.namespacePrefix}_forge_await`,
				{
					description: `Block until an outcome arrives on a pull request or issue \`agent\` is subscribed to, or \`timeoutMs\` passes (default ${String(DEFAULT_FORGE_AWAIT_TIMEOUT_MS)}, max ${String(MAX_FORGE_AWAIT_TIMEOUT_MS)}). Returns {notices,timedOut}. Use it instead of polling.`,
					inputSchema: z.object({
						agent: z.string().min(1),
						timeoutMs: z.number().optional(),
					}),
					outputSchema: z.object({
						notices: z.array(noticeSchema),
						timedOut: z.boolean(),
						reason: z.string().optional(),
					}),
				},
				async (args: {
					agent: string;
					timeoutMs?: number | undefined;
				}) => {
					// Off, waiting would only ever time out: say so at once.
					if (!options.enabled)
						return toolJson({
							notices: [],
							timedOut: false,
							reason: FORGE_EVENTS_OFF,
						});
					const controller = new AbortController();
					pending.add(controller);
					try {
						const notices = await bridge.next(
							args.agent,
							clampTimeout(args.timeoutMs),
							controller.signal,
						);
						return toolJson({
							notices: notices.map(
								({ repository, number, outcome }) => ({
									repository,
									number,
									outcome,
								}),
							),
							timedOut: notices.length === 0,
						});
					} finally {
						pending.delete(controller);
					}
				},
			);
		},
	};
	return [subscribe, wait];
};
