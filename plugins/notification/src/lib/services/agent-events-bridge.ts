import { basename, dirname, join } from 'node:path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
	SafeWorkspaceReader,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import {
	watchAgentHeartbeat,
	type IAgentEvent,
	type IAgentHeartbeatWatcher,
} from './agent-events';
import { safeSendLoggingMessage } from './safe-logging';

export interface IAgentEventsBridgeOptions {
	readonly namespacePrefix: string;
	readonly lockFileAbs: string;
	readonly heartbeatMs: number;
	readonly intervalMs?: number;
	/** Hook for the owning plugin to release an abandoned task immediately. */
	readonly onAgentDead?: (event: IAgentEvent) => void | Promise<void>;
	/** Remove the dead agent's persisted claim before publishing the event. */
	readonly autoReleaseDeadAgents?: boolean;
	/** Optional proposal registry paired with the watched lock file. */
	readonly agentRegistryFileAbs?: string;
	/** Optional task queue file whose subscription lease should be released. */
	readonly queueFileAbs?: string;
}

export interface IAgentEventsBridge {
	readonly watcher: IAgentHeartbeatWatcher;
	readonly events: readonly IAgentEvent[];
	close(): void;
}

const releaseDeadClaim = async (
	lockFile: string,
	event: IAgentEvent,
	options: Pick<
		IAgentEventsBridgeOptions,
		'agentRegistryFileAbs' | 'queueFileAbs'
	>,
): Promise<void> => {
	await withFileMutex(lockFile, async () => {
		let raw: string;
		try {
			raw = (
				await new SafeWorkspaceReader(dirname(lockFile)).readText(
					basename(lockFile),
				)
			).content;
		} catch {
			return;
		}
		let parsed: {
			version?: number;
			stale_after_minutes?: number;
			in_flight?: Array<Record<string, unknown>>;
		};
		try {
			parsed = JSON.parse(raw) as typeof parsed;
		} catch {
			return;
		}
		const current = Array.isArray(parsed.in_flight) ? parsed.in_flight : [];
		const removed = current.some(
			(entry) =>
				entry.task_id === event.taskId && entry.agent === event.agent,
		);
		if (!removed) return;
		parsed.in_flight = current.filter(
			(entry) =>
				!(
					entry.task_id === event.taskId &&
					entry.agent === event.agent
				),
		);
		await writeFileAtomic(lockFile, `${JSON.stringify(parsed, null, 2)}\n`);

		const tablePath = join(dirname(lockFile), 'file-locks.json');
		await withFileMutex(tablePath, async () => {
			try {
				const tableRaw = (
					await new SafeWorkspaceReader(dirname(tablePath)).readText(
						basename(tablePath),
					)
				).content;
				const table = JSON.parse(tableRaw) as {
					version?: number;
					locks?: Record<string, { taskId?: string }>;
					contentionHistory?: unknown[];
				};
				if (!table.locks) return;
				for (const [file, lock] of Object.entries(table.locks)) {
					if (lock.taskId === event.taskId) delete table.locks[file];
				}
				await writeFileAtomic(
					tablePath,
					`${JSON.stringify(table, null, 2)}\n`,
				);
			} catch {
				return;
			}
		});

		if (options.agentRegistryFileAbs !== undefined) {
			await withFileMutex(options.agentRegistryFileAbs, async () => {
				try {
					const registryPath = options.agentRegistryFileAbs as string;
					const registryRaw = (
						await new SafeWorkspaceReader(
							dirname(registryPath),
						).readText(basename(registryPath))
					).content;
					const registry = JSON.parse(registryRaw) as {
						assignments?: Array<{
							task_id?: string;
							agent_name?: string;
							parent_task_id?: string | null;
						}>;
					};
					const assignments = Array.isArray(registry.assignments)
						? registry.assignments
						: [];
					const released = new Set([event.taskId]);
					let changed = true;
					while (changed) {
						changed = false;
						for (const assignment of assignments) {
							if (
								typeof assignment.task_id === 'string' &&
								assignment.parent_task_id !== null &&
								typeof assignment.parent_task_id === 'string' &&
								released.has(assignment.parent_task_id) &&
								!released.has(assignment.task_id)
							) {
								released.add(assignment.task_id);
								changed = true;
							}
						}
					}
					const next = assignments.filter(
						(assignment) =>
							typeof assignment.task_id !== 'string' ||
							!released.has(assignment.task_id),
					);
					if (next.length !== assignments.length) {
						registry.assignments = next;
						await writeFileAtomic(
							registryPath,
							`${JSON.stringify(registry, null, 2)}\n`,
						);
					}
				} catch {
					return;
				}
			});
		}

		if (options.queueFileAbs !== undefined) {
			const leasePath = join(
				dirname(options.queueFileAbs),
				'.subscribe-leases.json',
			);
			await withFileMutex(leasePath, async () => {
				try {
					const leaseRaw = (
						await new SafeWorkspaceReader(
							dirname(leasePath),
						).readText(basename(leasePath))
					).content;
					const leases = JSON.parse(leaseRaw) as {
						leases?: Array<{ taskId?: string }>;
					};
					if (!Array.isArray(leases.leases)) return;
					const next = leases.leases.filter(
						(lease) => lease.taskId !== event.taskId,
					);
					if (next.length !== leases.leases.length) {
						leases.leases = next;
						await writeFileAtomic(
							leasePath,
							`${JSON.stringify(leases, null, 2)}\n`,
						);
					}
				} catch {
					return;
				}
			});
		}
	});
};

export const startAgentEventsBridge = (
	server: McpServer,
	options: IAgentEventsBridgeOptions,
): IAgentEventsBridge => {
	const events: IAgentEvent[] = [];
	const watcher = watchAgentHeartbeat({
		lockFile: options.lockFileAbs,
		heartbeatMs: options.heartbeatMs,
		...(options.intervalMs !== undefined
			? { intervalMs: options.intervalMs }
			: {}),
		onEvent: async (event) => {
			events.push(event);
			if (events.length > 200) events.shift();
			if (
				event.kind === 'agent-dead' &&
				options.autoReleaseDeadAgents !== false
			) {
				await releaseDeadClaim(options.lockFileAbs, event, options);
			}
			if (
				event.kind === 'agent-dead' &&
				options.onAgentDead !== undefined
			) {
				await Promise.resolve(options.onAgentDead(event));
			}
			safeSendLoggingMessage(server, {
				level: event.kind === 'agent-dead' ? 'warning' : 'info',
				logger: `${options.namespacePrefix}_agent_events`,
				data: { event: event.kind, ...event },
			});
		},
	});
	watcher.start();
	return {
		watcher,
		events,
		close: () => watcher.stop(),
	};
};
