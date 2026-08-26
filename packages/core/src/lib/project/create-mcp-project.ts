import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import type { IMcpVertexHostConfig } from '../contracts/interfaces/host-config.interface';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import { decideSurfaceModeFromCapabilities } from '../surface/decide-mode';
import { instrumentToolHandlers } from './instrument-tool-handlers.helper';
import { createToolSurfaceRuntime } from './tool-surface-runtime.service';

/**
 * An assembled (but not yet connected) MCP server. `start()` connects
 * the stdio transport; `registrationOrder` exposes the exact tool
 * registration sequence for audits and tests.
 */
export interface IMcpVertexProject {
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
	extras: readonly IToolRegistration[],
): readonly IToolRegistration[] {
	const sequence: IToolRegistration[] = [...core];
	const seen = new Set(core.map((registration) => registration.id));
	if (seen.size !== core.length) {
		throw new Error(
			'[mcp-vertex] duplicate registration id in core sequence',
		);
	}
	for (const extra of extras) {
		if (seen.has(extra.id)) {
			throw new Error(
				`[mcp-vertex] duplicate registration id "${extra.id}"`,
			);
		}
		seen.add(extra.id);
		if (extra.registerAfter === undefined) {
			sequence.push(extra);
			continue;
		}
		const anchorIndex = sequence.findIndex(
			(registration) => registration.id === extra.registerAfter,
		);
		if (anchorIndex < 0) {
			throw new Error(
				`[mcp-vertex] unknown registerAfter anchor "${extra.registerAfter}" for "${extra.id}"`,
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
export async function createMcpProject(
	config: IMcpVertexHostConfig,
): Promise<IMcpVertexProject> {
	const server = new McpServer({
		name: config.metadata.name,
		version: config.metadata.version,
	});
	// Instrument BEFORE registering tools so every handler is wrapped.
	instrumentToolHandlers(server, config);
	const toolSurfaceRuntime =
		config.toolSurfacePlan !== undefined
			? createToolSurfaceRuntime(config.toolSurfacePlan)
			: undefined;
	if (
		toolSurfaceRuntime !== undefined &&
		config.toolSurfaceRuntime !== undefined
	) {
		config.toolSurfaceRuntime.bind(toolSurfaceRuntime);
	}
	if (toolSurfaceRuntime !== undefined) {
		const previousOnInitialized = server.server.oninitialized;
		server.server.oninitialized = () => {
			previousOnInitialized?.();
			const decision = decideSurfaceModeFromCapabilities({
				clientInfo: server.server.getClientVersion(),
				capabilities: server.server.getClientCapabilities(),
				explicitMode: config.toolSurfacePlan?.explicitMode,
			});
			const change = toolSurfaceRuntime.applySurfaceMode(decision.mode);
			const client = server.server.getClientVersion();
			// q00007 + r00027: when the surface mode is already pinned via
			// `config.surfaceMode` (or the `vertex` preset default), the
			// explicit override leaves the surface unchanged. Skip the
			// log line so the operator's stderr stays clean — the
			// server still surfaces every loaded tool on the first
			// `tools/list`, which is the only thing the operator
			// actually needs to see. Surface transitions (`changed > 0`)
			// and capability-driven decisions still log because they
			// are real signals about what the client is asking for.
			if (
				change.changedToolNames.length > 0 ||
				!config.toolSurfacePlan?.explicitMode
			) {
				process.stderr.write(
					`[surface] Client "${client?.name ?? 'unknown'}" v${client?.version ?? 'unknown'}: ${decision.reason} (changed=${change.changedToolNames.length})\n`,
				);
			}
		};
	}
	let currentRegistration: IToolRegistration | undefined;
	const registrationServer =
		toolSurfaceRuntime === undefined
			? server
			: (() => {
					const proxy = Object.create(server) as McpServer;
					proxy.registerTool = ((name, cfg, cb) => {
						const registrationId = currentRegistration?.id ?? name;
						const originalConfig = cfg as {
							description?: string | undefined;
							inputSchema?: unknown;
							outputSchema?: unknown;
						};
						const publicDescription =
							toolSurfaceRuntime.publicDescriptionFor(
								registrationId,
								originalConfig.description,
								currentRegistration?.summary,
							);
						const handle = server.registerTool(
							name,
							{
								...cfg,
								...(publicDescription !== undefined
									? { description: publicDescription }
									: {}),
							},
							cb,
						);
						toolSurfaceRuntime.bindRegisteredTool({
							registrationId,
							name,
							description: originalConfig.description,
							inputSchema: originalConfig.inputSchema,
							outputSchema: originalConfig.outputSchema,
							handler: handle.handler,
							handle,
						});
						return handle;
					}) as McpServer['registerTool'];
					return proxy;
				})();
	const ordered = planRegistrationOrder([], config.extraTools ?? []);
	for (const registration of ordered) {
		currentRegistration = registration;
		await registration.register(registrationServer);
	}
	currentRegistration = undefined;
	toolSurfaceRuntime?.finalizeInitialSurface();
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
