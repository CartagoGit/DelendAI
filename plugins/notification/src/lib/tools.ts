import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { IToolRegistration } from '@cartago-git/mcp-core/public';
import { toolJson } from '@cartago-git/mcp-core/public';

import {
	createReleaseWatcher,
	type IReleasedClaim,
	type IReleaseWatcher,
} from './watcher';

export interface INotifyToolOptions {
	readonly namespacePrefix: string;
	/** Absolute path of the shared lock file to watch. */
	readonly lockFileAbs: string;
	/** Polling fallback interval (ms). Default 2000. */
	readonly intervalMs?: number;
}

/**
 * `<prefix>_notify_status` — and the side effect that matters: it starts
 * a lock-release watcher wired to the live server's `notifications/message`
 * channel. When a watched lock frees, the server pushes
 * `{ event: "lock-released", taskId, agent, files }` so waiting agents
 * react immediately instead of polling `agent_lock status` in a loop.
 */
export const buildNotifyRegistration = (
	options: INotifyToolOptions
): IToolRegistration => {
	let watcher: IReleaseWatcher | undefined;
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

			// Tear the watcher down with the server so we don't leak timers.
			const previousOnClose = server.server.onclose;
			server.server.onclose = (): void => {
				watcher?.stop();
				previousOnClose?.();
			};

			server.registerTool(
				`${options.namespacePrefix}_notify_status`,
				{
					description:
						'Report the lock-release notifier: the watched lock file, how many lock-released notifications it has pushed, and the most recent releases. The notifier emits notifications/message {event:"lock-released",taskId,agent,files} so agents react to freed files instead of polling agent_lock.',
				},
				async () =>
					toolJson({
						watching: options.lockFileAbs,
						emitted,
						lastReleases,
					})
			);
		},
	};
};
