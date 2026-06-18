import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import type { IMcpVertexHostConfig } from '../contracts/interfaces/host-config.interface';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import {
	estimateResultBytes,
	type IMetricsRegistry,
} from '../metrics/metrics-registry';

/**
 * Wrap `server.registerTool` so every tool handler records latency, response
 * bytes and error flag into the metrics registry (M12). Transparent: the tool
 * contract is unchanged; instrumentation is pure measurement around the call.
 */
const instrumentToolMetrics = (
	server: McpServer,
	registry: IMetricsRegistry
): void => {
	type RegisterTool = McpServer['registerTool'];
	const original = server.registerTool.bind(server) as RegisterTool;
	const wrap = (name: string, handler: unknown): unknown => {
		if (typeof handler !== 'function') return handler;
		const fn = handler as (...args: unknown[]) => unknown;
		return async (...args: unknown[]): Promise<unknown> => {
			const start = performance.now();
			try {
				const result = await fn(...args);
				registry.record(name, {
					ms: performance.now() - start,
					bytes: estimateResultBytes(result),
					isError: (result as { isError?: boolean })?.isError === true,
				});
				return result;
			} catch (err) {
				registry.record(name, {
					ms: performance.now() - start,
					bytes: 0,
					isError: true,
				});
				throw err;
			}
		};
	};
	// registerTool is heavily overloaded; the handler is always the last arg.
	(server as { registerTool: (...a: unknown[]) => unknown }).registerTool = (
		...callArgs: unknown[]
	) => {
		const name = callArgs[0] as string;
		const last = callArgs.length - 1;
		callArgs[last] = wrap(name, callArgs[last]);
		return (original as (...a: unknown[]) => unknown)(...callArgs);
	};
};

/**
 * An assembled (but not yet connected) MCP server. `start()` connects
 * the stdio transport; `registrationOrder` exposes the exact tool
 * registration sequence for audits and tests.
 */
export interface IMcpVertexServer {
	readonly server: McpServer;
	readonly registrationOrder: readonly string[];
	start(): Promise<void>;
}

/**
 * Compute the final registration sequence: core registrations first
 * (in declared order), then each extra appended at the end — or, when
 * `registerAfter` names an anchor, inserted immediately after it.
 * Multiple extras anchored to the same id keep declaration order.
 * Pure and deterministic; throws on duplicate ids and unknown anchors
 * so a misconfigured host fails fast instead of drifting silently.
 */
export function planRegistrationOrder(
	core: readonly IToolRegistration[],
	extras: readonly IToolRegistration[]
): readonly IToolRegistration[] {
	const sequence: IToolRegistration[] = [...core];
	const seen = new Set(core.map((registration) => registration.id));
	if (seen.size !== core.length) {
		throw new Error(
			'[mcp-vertex] duplicate registration id in core sequence'
		);
	}
	for (const extra of extras) {
		if (seen.has(extra.id)) {
			throw new Error(
				`[mcp-vertex] duplicate registration id "${extra.id}"`
			);
		}
		seen.add(extra.id);
		if (extra.registerAfter === undefined) {
			sequence.push(extra);
			continue;
		}
		const anchorIndex = sequence.findIndex(
			(registration) => registration.id === extra.registerAfter
		);
		if (anchorIndex < 0) {
			throw new Error(
				`[mcp-vertex] unknown registerAfter anchor "${extra.registerAfter}" for "${extra.id}"`
			);
		}
		let insertIndex = anchorIndex + 1;
		while (
			insertIndex < sequence.length &&
			sequence[insertIndex]?.registerAfter === extra.registerAfter
		) {
			insertIndex += 1;
		}
		sequence.splice(insertIndex, 0, extra);
	}
	return sequence;
}

/**
 * Assemble an MCP server from a host config: deterministic tool
 * registration (core + extras), then prompts, then resources. The
 * caller starts the stdio transport via `start()`.
 */
export async function createMcpServer(
	config: IMcpVertexHostConfig
): Promise<IMcpVertexServer> {
	const server = new McpServer({
		name: config.metadata.name,
		version: config.metadata.version,
	});
	// Instrument BEFORE registering tools so every handler is wrapped (M12).
	if (config.metricsRegistry) {
		instrumentToolMetrics(server, config.metricsRegistry);
	}
	const ordered = planRegistrationOrder([], config.extraTools ?? []);
	for (const registration of ordered) {
		await registration.register(server);
	}
	for (const prompt of config.extraPrompts ?? []) {
		await prompt.register(server);
	}
	for (const resource of config.extraResources ?? []) {
		await resource.register(server);
	}
	return {
		server,
		registrationOrder: ordered.map((registration) => registration.id),
		async start(): Promise<void> {
			await server.connect(new StdioServerTransport());
		},
	};
}
