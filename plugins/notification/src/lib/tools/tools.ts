import { join } from 'node:path';
import z from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { IToolRegistration } from '@delendai/core/public';
import { toolJson } from '@delendai/core/public';

import {
	awaitLockRelease,
	createReleaseWatcher,
	createHandoffWatcher,
	type IReleasedClaim,
	type IReleaseWatcher,
	type IHandoffWatcher,
} from '../services/watcher';
import {
	startAgentEventsBridge,
	type IAgentEventsBridge,
} from '../services/agent-events-bridge';
import { safeSendLoggingMessage } from '../services/safe-logging';
import { readLockSnapshot } from '../services/lock-snapshot';
import { diagnoseWaitTimeout } from '../services/wait-diagnosis';
import {
	readRegisteredWaits,
	registerWait,
	unregisterWait,
} from '../services/wait-registry';

export interface INotifyToolOptions {
	readonly namespacePrefix: string;
	/** Absolute path of the shared lock file to watch. */
	readonly lockFileAbs: string;
	/** Absolute path of the spawned-agent registry to reconcile on death. */
	readonly agentRegistryFileAbs?: string;
	/** Absolute path of the task queue whose subscription lease is released. */
	readonly queueFileAbs?: string;
	/** Absolute path of the handoff directory to watch. */
	readonly handoffDirAbs: string;
	/** Workspace-relative path of the handoff directory. */
	readonly handoffDirRel: string;
	/** Polling fallback interval (ms). Default 2000. */
	readonly intervalMs?: number;
	/** Heartbeat interval used to classify agent alive/idle/dead. Default 10000. */
	readonly heartbeatMs?: number;
}

type ICloseCapableServer = {
	readonly server?: {
		onclose?: (() => void) | undefined;
	};
};

const attachCloseHandler = (server: McpServer, handler: () => void): void => {
	const closeCapable = server as McpServer & ICloseCapableServer;
	const transportServer = closeCapable.server;
	if (transportServer === undefined) return;
	const previousOnClose = transportServer.onclose;
	transportServer.onclose = (): void => {
		handler();
		previousOnClose?.();
	};
};

const DEFAULT_AWAIT_LOCK_TIMEOUT_MS = 30_000;
const MAX_AWAIT_LOCK_TIMEOUT_MS = 120_000;

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
						safeSendLoggingMessage(server, {
							level: 'info',
							logger: `${options.namespacePrefix}_notification`,
							data: {
								event: 'lock-released',
								taskId: claim.taskId,
								agent: claim.agent,
								files: claim.files,
							},
						});
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
						safeSendLoggingMessage(server, {
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
						});
					}
				},
			});
			handoffWatcher.start();

			agentEventsBridge = startAgentEventsBridge(server, {
				namespacePrefix: options.namespacePrefix,
				lockFileAbs: options.lockFileAbs,
				...(options.agentRegistryFileAbs !== undefined
					? { agentRegistryFileAbs: options.agentRegistryFileAbs }
					: {}),
				...(options.queueFileAbs !== undefined
					? { queueFileAbs: options.queueFileAbs }
					: {}),
				heartbeatMs: options.heartbeatMs ?? 10_000,
				...(options.intervalMs !== undefined
					? { intervalMs: options.intervalMs }
					: {}),
			});

			// Tear the watcher down with the server so we don't leak timers.
			attachCloseHandler(server, () => {
				watcher?.stop();
				handoffWatcher?.stop();
				agentEventsBridge?.close();
			});

			server.registerTool(
				`${options.namespacePrefix}_notify_status`,
				{
					description:
						'Report the lock-release notifier: the watched lock file, how many lock-released notifications it has pushed, and the most recent releases. The notifier emits notifications/message {event:"lock-released",taskId,agent,files} so agents react to freed files instead of polling agent_lock.',
					inputSchema: z.object({}).strict(),
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
			attachCloseHandler(server, () => {
				for (const ac of pending) ac.abort();
				pending.clear();
			});

			server.registerTool(
				`${options.namespacePrefix}_await_lock`,
				{
					description: `Block until the lock for \`taskId\` is released (no longer in-flight) or \`timeoutMs\` elapses (default ${DEFAULT_AWAIT_LOCK_TIMEOUT_MS}, max ${MAX_AWAIT_LOCK_TIMEOUT_MS}), then return {taskId,released,timedOut,alreadyFree,waitedMs}. Use this after agent_lock returns lock-conflict: wait once, then retry the claim — do NOT poll agent_lock status in a loop. On timeout the result also carries {verdict,holder,reason,nextAction}: FOLLOW nextAction, which is never "wait again". Pass your own \`agent\` id so a mutual wait between you and the holder can be detected as the deadlock it is.`,
					inputSchema: z.object({
						taskId: z.string().min(1),
						timeoutMs: z.number().optional(),
						agent: z.string().min(1).optional(),
					}),
					outputSchema: z.object({
						taskId: z.string(),
						released: z.boolean(),
						timedOut: z.boolean(),
						alreadyFree: z.boolean(),
						waitedMs: z.number(),
						verdict: z.string().optional(),
						holder: z
							.object({
								taskId: z.string(),
								agent: z.string(),
								files: z.array(z.string()),
								lastSeen: z.string().optional(),
								heldForMs: z.number().optional(),
							})
							.optional(),
						reason: z.string().optional(),
						nextAction: z.string().optional(),
					}),
				},
				async (args: {
					taskId: string;
					timeoutMs?: number | undefined;
					agent?: string | undefined;
				}) => {
					const ac = new AbortController();
					pending.add(ac);
					// Publish the wait so a peer that ends up waiting on
					// THIS agent can see the cycle. Best-effort on both
					// sides: the registry never gates the wait itself.
					if (args.agent !== undefined) {
						await registerWait({
							lockFile: options.lockFileAbs,
							waiter: args.agent,
							waitingOnTaskId: args.taskId,
						});
					}
					try {
						const r = await awaitLockRelease({
							lockFile: options.lockFileAbs,
							taskId: args.taskId,
							...(args.timeoutMs !== undefined
								? { timeoutMs: args.timeoutMs }
								: {}),
							signal: ac.signal,
						});
						const base = {
							taskId: args.taskId,
							released: r.released,
							timedOut: r.timedOut,
							alreadyFree: r.alreadyFree,
							waitedMs: r.waitedMs,
						};
						if (!r.timedOut) return toolJson(base);
						// A bare `timedOut: true` leaves the agent exactly
						// one move — wait again — and two agents doing that
						// to each other never progress. Every timeout comes
						// back with the reason and a next call that is not
						// the one that just failed.
						const diagnosis = diagnoseWaitTimeout({
							snapshot: await readLockSnapshot(
								options.lockFileAbs,
							),
							taskId: args.taskId,
							...(args.agent !== undefined
								? { waiterAgent: args.agent }
								: {}),
							waits: await readRegisteredWaits(
								options.lockFileAbs,
							),
						});
						return toolJson({
							...base,
							verdict: diagnosis.verdict,
							...(diagnosis.holder !== undefined
								? { holder: diagnosis.holder }
								: {}),
							reason: diagnosis.reason,
							nextAction: diagnosis.nextAction,
						});
					} finally {
						pending.delete(ac);
						// However the wait ended — released, timed out,
						// aborted by a server close, or thrown through —
						// the wait row goes. A registry that outlived its
						// waits would invent deadlocks that do not exist.
						if (args.agent !== undefined) {
							await unregisterWait({
								lockFile: options.lockFileAbs,
								waiter: args.agent,
							});
						}
					}
				},
			);
		},
	};
};
