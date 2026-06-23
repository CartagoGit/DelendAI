import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
	watchAgentHeartbeat,
	type IAgentEvent,
	type IAgentHeartbeatWatcher,
} from './agent-events';

export interface IAgentEventsBridgeOptions {
	readonly namespacePrefix: string;
	readonly lockFileAbs: string;
	readonly heartbeatMs: number;
	readonly intervalMs?: number;
}

export interface IAgentEventsBridge {
	readonly watcher: IAgentHeartbeatWatcher;
	readonly events: readonly IAgentEvent[];
	close(): void;
}

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
		onEvent: (event) => {
			events.push(event);
			if (events.length > 200) events.shift();
			void server
				.sendLoggingMessage({
					level: event.kind === 'agent-dead' ? 'warning' : 'info',
					logger: `${options.namespacePrefix}_agent_events`,
					data: { event: event.kind, ...event },
				})
				.catch(() => undefined);
		},
	});
	watcher.start();
	return {
		watcher,
		events,
		close: () => watcher.stop(),
	};
};
