import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { setMaxListeners } from 'node:events';

import type { IMcpVertexHostConfig } from '../contracts/interfaces/host-config.interface';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import { decideSurfaceModeFromCapabilities } from '../surface/decide-mode';
import { instrumentToolHandlers } from './instrument-tool-handlers.helper';
import { createToolSurfaceRuntime } from './tool-surface-runtime.service';
import { buildKnowledgeResourceRegistrations } from '../tools/knowledge-resources';

/**
 * Bound on how long `dispose()` waits for an in-flight lazily-activated
 * tool call to drain before tearing down plugin runtimes anyway. A
 * wedged handler must never pin teardown open forever (AUD-E02).
 */
const DISPOSE_DRAIN_TIMEOUT_MS = 5_000;
const DISPOSE_DRAIN_POLL_MS = 25;

const installListChangeBatching = (
	server: McpServer,
): {
	batch<T>(work: () => Promise<T>): Promise<T>;
	batchSync<T>(work: () => T): T;
} => {
	let depth = 0;
	let toolsPending = false;
	let promptsPending = false;
	let resourcesPending = false;
	const sendToolListChanged = server.sendToolListChanged.bind(server);
	const sendPromptListChanged = server.sendPromptListChanged.bind(server);
	const sendResourceListChanged = server.sendResourceListChanged.bind(server);
	server.sendToolListChanged = () => {
		if (depth > 0) {
			toolsPending = true;
			return Promise.resolve();
		}
		return sendToolListChanged();
	};
	server.sendPromptListChanged = () => {
		if (depth > 0) {
			promptsPending = true;
			return Promise.resolve();
		}
		return sendPromptListChanged();
	};
	server.sendResourceListChanged = () => {
		if (depth > 0) {
			resourcesPending = true;
			return Promise.resolve();
		}
		return sendResourceListChanged();
	};
	const flush = async (): Promise<void> => {
		const flushTools = toolsPending;
		const flushPrompts = promptsPending;
		const flushResources = resourcesPending;
		toolsPending = false;
		promptsPending = false;
		resourcesPending = false;
		if (flushTools) await sendToolListChanged();
		if (flushPrompts) await sendPromptListChanged();
		if (flushResources) await sendResourceListChanged();
	};
	return {
		async batch<T>(work: () => Promise<T>): Promise<T> {
			depth += 1;
			try {
				return await work();
			} finally {
				depth -= 1;
				if (depth === 0) await flush();
			}
		},
		batchSync<T>(work: () => T): T {
			depth += 1;
			try {
				return work();
			} finally {
				depth -= 1;
				if (depth === 0) void flush();
			}
		},
	};
};

/**
 * An assembled (but not yet connected) MCP server. `start()` connects
 * the stdio transport; `registrationOrder` exposes the exact tool
 * registration sequence for audits and tests.
 */
export interface IMcpVertexProject {
	readonly server: McpServer;
	readonly registrationOrder: readonly string[];
	start(): Promise<void>;
	/**
	 * Idempotent teardown (r00039 / AUD-E02): waits (bounded) for any
	 * in-flight lazily-activated tool invocation to drain, then disposes
	 * every plugin runtime this project activated — eager or lazy,
	 * whichever ran — in reverse activation order. Safe to call more
	 * than once, and safe to call even if `start()` was never invoked.
	 * Does not close the transport itself; wire `SIGTERM`/`SIGINT` to
	 * this alongside `gracefulShutdown(server)` (see `run-cli.ts`).
	 */
	dispose(): Promise<void>;
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
	const withListChangeBatch = installListChangeBatching(server);
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
		toolSurfaceRuntime.setListChangeBatcher?.(withListChangeBatch);
	}
	const knowledgeResourceRegistrations = new Map<string, Promise<void>>();
	const registerKnowledgeResource = (
		resource: IToolRegistration,
	): Promise<void> => {
		const uri = `knowledge://${resource.id.slice('resource:'.length)}`;
		const existing = knowledgeResourceRegistrations.get(uri);
		if (existing !== undefined) return existing;
		const registration = resource.register(server);
		knowledgeResourceRegistrations.set(uri, registration);
		return registration;
	};
	if (toolSurfaceRuntime !== undefined) {
		const materializedLazyTools = new Map<
			string,
			Promise<{
				readonly description?: string | undefined;
				readonly inputSchema?: unknown;
				readonly outputSchema?: unknown;
				readonly handler: unknown;
			}>
		>();
		const lazyToolActivators = new Map<
			string,
			() => Promise<{
				readonly description?: string | undefined;
				readonly inputSchema?: unknown;
				readonly outputSchema?: unknown;
				readonly handler: unknown;
			}>
		>();
		const announcedLazyPlugins = new Set<string>();
		const drainLazyPluginRegistrations = async (): Promise<void> => {
			for (const registrations of config.consumeLazyPluginRegistrations?.() ??
				[]) {
				for (const prompt of registrations.prompts ?? []) {
					await prompt.register(server);
				}
				for (const resource of registrations.resources ?? []) {
					await resource.register(server);
				}
				for (const resource of buildKnowledgeResourceRegistrations(
					registrations.knowledge ?? [],
				)) {
					await registerKnowledgeResource(resource);
				}
			}
		};
		const materializeLazyTool = async (
			registrationId: string,
			activate: () => Promise<{
				readonly description?: string | undefined;
				readonly inputSchema?: unknown;
				readonly outputSchema?: unknown;
				readonly handler: unknown;
			}>,
		): Promise<{
			readonly description?: string | undefined;
			readonly inputSchema?: unknown;
			readonly outputSchema?: unknown;
			readonly handler: unknown;
		}> => {
			const existing = materializedLazyTools.get(registrationId);
			if (existing !== undefined) return existing;
			const materialization = (async () => {
				const binding = await activate();
				await drainLazyPluginRegistrations();
				const descriptor = config.toolSurfacePlan?.descriptors.find(
					(entry) => entry.registrationId === registrationId,
				);
				if (descriptor === undefined) return binding;
				// Register through the already-instrumented MCP server so a
				// first-use tool keeps metrics, lifecycle hooks, abort handling,
				// and error/result decoration identical to an eager tool.
				const handle = server.registerTool(
					descriptor.name,
					{
						...(binding.description !== undefined
							? { description: binding.description }
							: {}),
						...(binding.inputSchema !== undefined
							? { inputSchema: binding.inputSchema }
							: {}),
						...(binding.outputSchema !== undefined
							? { outputSchema: binding.outputSchema }
							: {}),
					} as never,
					binding.handler as never,
				);
				const instrumentedBinding = {
					...binding,
					handler: handle.handler,
				};
				// Keep the runtime record tied to the real SDK handle. This makes
				// explicit plugin activation visible to tools/list and lets the
				// SDK emit tools/list_changed. The managed surface still starts
				// hidden until the plugin is explicitly activated.
				toolSurfaceRuntime.bindRegisteredTool({
					registrationId,
					name: descriptor.name,
					description: instrumentedBinding.description,
					inputSchema: instrumentedBinding.inputSchema,
					outputSchema: instrumentedBinding.outputSchema,
					handler: instrumentedBinding.handler,
					handle,
				});
				handle.disable();
				return instrumentedBinding;
			})();
			materializedLazyTools.set(registrationId, materialization);
			return materialization;
		};
		for (const [registrationId, activate] of config.lazyToolActivators ??
			[]) {
			lazyToolActivators.set(registrationId, activate);
			toolSurfaceRuntime.bindLazyTool({
				registrationId,
				activate: () => materializeLazyTool(registrationId, activate),
			});
		}
		if (
			config.lazyPluginActivators !== undefined &&
			toolSurfaceRuntime.setLazyPluginLoader !== undefined
		) {
			toolSurfaceRuntime.setLazyPluginLoader(async (pluginId) => {
				await withListChangeBatch.batch(async () => {
					const activatePlugin =
						config.lazyPluginActivators?.get(pluginId);
					if (activatePlugin === undefined) return;
					await activatePlugin();
					const plugin = config.toolSurfacePlan?.plugins.find(
						(entry) => entry.id === pluginId,
					);
					const discoveredToolNames: string[] = [];
					for (const registrationId of plugin?.toolRegistrationIds ??
						[]) {
						const materialize =
							lazyToolActivators.get(registrationId);
						if (materialize !== undefined) {
							await materializeLazyTool(
								registrationId,
								materialize,
							);
							const descriptor =
								config.toolSurfacePlan?.descriptors.find(
									(entry) =>
										entry.registrationId === registrationId,
								);
							if (descriptor !== undefined) {
								discoveredToolNames.push(descriptor.name);
							}
						}
					}
					await drainLazyPluginRegistrations();
					if (config.runtimeEventSink !== undefined) {
						void Promise.resolve(
							config.runtimeEventSink.emit({
								version: 1,
								ts: new Date().toISOString(),
								kind: 'plugin.activated',
								pluginName: pluginId,
								toolCount: discoveredToolNames.length,
							}),
						).catch(() => undefined);
					}
					if (
						discoveredToolNames.length > 0 &&
						!announcedLazyPlugins.has(pluginId)
					) {
						announcedLazyPlugins.add(pluginId);
						process.stderr.write(
							`[surface] plugin-discovered plugin=${pluginId} tools=${discoveredToolNames.length} names=${discoveredToolNames.join(', ')}\n`,
						);
					}
				});
			});
		}
		if (
			config.disposePlugin !== undefined &&
			toolSurfaceRuntime.setPluginDisposer !== undefined
		) {
			// x00286 S4: connects `evictIdlePlugins`'s bookkeeping-only
			// eviction to a real per-plugin dispose. Without this, an
			// evicted plugin's tools relazy but its timers/listeners/child
			// processes outlive it (AUD-C02's "no descarga, no libera"
			// half) — `disposePlugin` here is the managed lazy runtime's
			// retained `dispose` for exactly this plugin id.
			toolSurfaceRuntime.setPluginDisposer(config.disposePlugin);
		}
		const previousOnInitialized = server.server.oninitialized;
		server.server.oninitialized = () => {
			previousOnInitialized?.();
			const decision = decideSurfaceModeFromCapabilities({
				clientInfo: server.server.getClientVersion(),
				capabilities: server.server.getClientCapabilities(),
				explicitMode: config.toolSurfacePlan?.explicitMode,
			});
			// `oninitialized` is a fire-and-forget SDK callback (it is not
			// awaited by `client.connect()`), and switching TO `native`
			// needs to materialize every still-lazy plugin before the
			// surface's visibility is computed (AUD-C01) — that import +
			// register() work is async, so this handler must be too. Wrap
			// rather than change the callback's own signature: nothing
			// downstream needs to await this handler; the e2e test that
			// depends on the outcome already polls `tools/list` for exactly
			// this reason.
			void (async () => {
				const change = await toolSurfaceRuntime.applySurfaceModeAsync(
					decision.mode,
				);
				const client = server.server.getClientVersion();
				// When the surface mode is already pinned via
				// `config.surfaceMode` (or the `vertex` preset default), the
				// explicit override leaves the surface unchanged. Skip the
				// log line so the operator's stderr stays clean — the
				// managed mode shows only bootstrap and router tools on the first
				// `tools/list`,
				// while native compatibility mode surfaces every loaded tool.
				// Only report a real transition. The stable managed default must not
				// add a redundant capability-negotiation line to stderr on every boot;
				// the operator-facing Startup Report already records the effective mode.
				if (change.changedToolNames.length > 0) {
					process.stderr.write(
						`[surface] Client "${client?.name ?? 'unknown'}" v${client?.version ?? 'unknown'}: ${decision.reason} (changed=${change.changedToolNames.length})\n`,
					);
				}
			})();
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
		if (resource.id.startsWith('resource:')) {
			await registerKnowledgeResource(resource);
			continue;
		}
		await resource.register(server);
	}
	let disposed = false;
	return {
		server,
		registrationOrder: ordered.map((registration) => registration.id),
		async start(): Promise<void> {
			const transport = new StdioServerTransport();
			// The MCP SDK attaches one `drain` listener per pending stdio
			// write. Startup can legitimately publish more than ten frames
			// before stdout drains, so the default EventTarget warning is
			// noisy here even though the listeners are released by `send`.
			setMaxListeners(0, process.stdout);
			await server.connect(transport);
		},
		async dispose(): Promise<void> {
			if (disposed) return;
			disposed = true;
			const runtime = toolSurfaceRuntime;
			if (runtime !== undefined) {
				const deadline = Date.now() + DISPOSE_DRAIN_TIMEOUT_MS;
				while (runtime.hasInFlightWork() && Date.now() < deadline) {
					await new Promise((resolve) =>
						setTimeout(resolve, DISPOSE_DRAIN_POLL_MS),
					);
				}
			}
			await config.disposePlugins?.();
		},
	};
}
