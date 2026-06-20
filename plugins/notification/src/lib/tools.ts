import { join } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import {
	awaitLockRelease,
	createReleaseWatcher,
	createHandoffWatcher,
	type IReleasedClaim,
	type IReleaseWatcher,
	type IHandoffWatcher,
} from './watcher';
import {
	startAgentEventsBridge,
	type IAgentEventsBridge,
} from './agent-events-bridge';

export interface INotifyToolOptions {
	readonly namespacePrefix: string;
	/** Absolute path of the shared lock file to watch. */
	readonly lockFileAbs: string;
	/** Absolute path of the handoff directory to watch. */
	readonly handoffDirAbs: string;
	/** Workspace-relative path of the handoff directory. */
	readonly handoffDirRel: string;
	/** Polling fallback interval (ms). Default 2000. */
	readonly intervalMs?: number;
	/** Heartbeat interval used to classify agent alive/idle/dead. Default 10000. */
	readonly heartbeatMs?: number;
}

/**
 * `<prefix>_notify_status` — and the side effect that matters: it starts
 * a lock-release watcher wired to the live server's `notifications/message`
 * channel. When a watched lock frees, the server pushes
 * `{ event: "lock-released", taskId, agent, files }` so waiting agents
 * react immediately instead of polling `agent_lock status` in a loop.
 */
export const buildNotifyRegistration = (
	options: INotifyToolOptions,
): IToolRegistration => {
	let watcher: IReleaseWatcher | undefined;
	let handoffWatcher: IHandoffWatcher | undefined;
	let agentEventsBridge: IAgentEventsBridge | undefined;
	let lastReleases: readonly IReleasedClaim[] = [];
	let emitted = 0;

	return {
		id: 'notify_status',
		summary:
			'Lock-release notifier: pushes notifications/message when a watched lock frees, so agents stop polling.',
		tags: ['coordination', 'lazy'],
		register: async (server: McpServer) => {
			watcher = createReleaseWatcher({
				lockFile: options.lockFileAbs,
				...(options.intervalMs !== undefined
					? { intervalMs: options.intervalMs }
					: {}),
				onRelease: (released) => {
					lastReleases = [...released];
					for (const claim of released) {
						emitted += 1;
						void server
							.sendLoggingMessage({
								level: 'info',
								logger: `${options.namespacePrefix}_notification`,
								data: {
									event: 'lock-released',
									taskId: claim.taskId,
									agent: claim.agent,
									files: claim.files,
								},
							})
							.catch(() => undefined);
					}
				},
			});
			watcher.start();

			handoffWatcher = createHandoffWatcher({
				handoffDir: options.handoffDirAbs,
				...(options.intervalMs !== undefined
					? { intervalMs: options.intervalMs }
					: {}),
				onHandoff: (events) => {
					for (const ev of events) {
						void server
							.sendLoggingMessage({
								level: 'warning',
								logger: `${options.namespacePrefix}_notification`,
								data: {
									event: 'stuck-detected',
									agent: ev.agent,
									reason: ev.reason,
									handoffPath: join(
										options.handoffDirRel,
										ev.file,
									),
								},
							})
							.catch(() => undefined);
					}
				},
			});
			handoffWatcher.start();

			agentEventsBridge = startAgentEventsBridge(server, {
				namespacePrefix: options.namespacePrefix,
				lockFileAbs: options.lockFileAbs,
				heartbeatMs: options.heartbeatMs ?? 10_000,
				...(options.intervalMs !== undefined
					? { intervalMs: options.intervalMs }
					: {}),
			});

			// Tear the watcher down with the server so we don't leak timers.
			const previousOnClose = server.server.onclose;
			server.server.onclose = (): void => {
				watcher?.stop();
				handoffWatcher?.stop();
				agentEventsBridge?.close();
				previousOnClose?.();
			};

			server.registerTool(
				`${options.namespacePrefix}_notify_status`,
				{
					description:
						'Report the lock-release notifier: the watched lock file, how many lock-released notifications it has pushed, and the most recent releases. The notifier emits notifications/message {event:"lock-released",taskId,agent,files} so agents react to freed files instead of polling agent_lock.',
					outputSchema: z.object({
						watching: z.string(),
						emitted: z.number(),
						lastReleases: z.array(
							z.object({
								taskId: z.string(),
								agent: z.string(),
								files: z.array(z.string()),
							}),
						),
						agentEvents: z.number(),
					}),
				},
				async () =>
					toolJson({
						watching: options.lockFileAbs,
						emitted,
						lastReleases,
						agentEvents: agentEventsBridge?.events.length ?? 0,
					}),
			);
		},
	};
};

/**
 * `<prefix>_await_lock` — block until the lock for `taskId` is released (or
 * `timeoutMs` elapses), then return. This is the consumer side of the notifier:
 * after `agent_lock` returns `lock-conflict`, call this once and retry the claim
 * when it resolves, instead of polling `agent_lock status` in a loop. Pending
 * waits are aborted when the server closes.
 */
export const buildAwaitLockRegistration = (
	options: INotifyToolOptions,
): IToolRegistration => {
	const pending = new Set<AbortController>();
	return {
		id: 'await_lock',
		summary:
			'Wait until a task lock is released (or timeout), so agents stop polling agent_lock status.',
		tags: ['coordination', 'lazy'],
		register: async (server: McpServer) => {
			const previousOnClose = server.server.onclose;
			server.server.onclose = (): void => {
				for (const ac of pending) ac.abort();
				pending.clear();
				previousOnClose?.();
			};

			server.registerTool(
				`${options.namespacePrefix}_await_lock`,
				{
					description:
						'Block until the lock for `taskId` is released (no longer in-flight) or `timeoutMs` elapses (default 30000, max 120000), then return {taskId,released,timedOut,alreadyFree,waitedMs}. Use this after agent_lock returns lock-conflict: wait once, then retry the claim — do NOT poll agent_lock status in a loop.',
					inputSchema: z.object({
						taskId: z.string().min(1),
						timeoutMs: z.number().optional(),
					}),
					outputSchema: z.object({
						taskId: z.string(),
						released: z.boolean(),
						timedOut: z.boolean(),
						alreadyFree: z.boolean(),
						waitedMs: z.number(),
					}),
				},
				async (args: {
					taskId: string;
					timeoutMs?: number | undefined;
				}) => {
					const ac = new AbortController();
					pending.add(ac);
					try {
						const r = await awaitLockRelease({
							lockFile: options.lockFileAbs,
							taskId: args.taskId,
							...(args.timeoutMs !== undefined
								? { timeoutMs: args.timeoutMs }
								: {}),
							signal: ac.signal,
						});
						return toolJson({
							taskId: args.taskId,
							released: r.released,
							timedOut: r.timedOut,
							alreadyFree: r.alreadyFree,
							waitedMs: r.waitedMs,
						});
					} finally {
						pending.delete(ac);
					}
				},
			);
		},
	};
};
