import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import type { IMcpCoreHostConfig } from '../contracts/interfaces/host-config.interface';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';

/**
 * An assembled (but not yet connected) MCP server. `start()` connects
 * the stdio transport; `registrationOrder` exposes the exact tool
 * registration sequence for audits and tests.
 */
export interface IMcpCoreServer {
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
			'[mcp-core] duplicate registration id in core sequence'
		);
	}
	for (const extra of extras) {
		if (seen.has(extra.id)) {
			throw new Error(
				`[mcp-core] duplicate registration id "${extra.id}"`
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
				`[mcp-core] unknown registerAfter anchor "${extra.registerAfter}" for "${extra.id}"`
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
	config: IMcpCoreHostConfig
): Promise<IMcpCoreServer> {
	const server = new McpServer({
		name: config.metadata.name,
		version: config.metadata.version,
	});
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
