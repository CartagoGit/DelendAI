import z from 'zod';

import type { ICorePaths } from '../contracts/interfaces/core-paths.interface';
import type { IToolSurfaceRuntimeAccess } from '../contracts/interfaces/tool-surface.interface';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import { toolError, toolJson } from '../shared/tool-response';

const SEARCH_ENTRY = z.object({
	registrationId: z.string(),
	name: z.string(),
	toolId: z.string(),
	pluginId: z.string().optional(),
	namespace: z.string().optional(),
	summary: z.string().optional(),
	tags: z.array(z.string()).optional(),
	active: z.boolean(),
	detailsId: z.string(),
});

const PLUGIN_CHANGE = z.object({
	pluginId: z.string(),
	namespace: z.string(),
	active: z.boolean(),
	changedToolNames: z.array(z.string()),
	visibleToolNames: z.array(z.string()),
	note: z.string().optional(),
});

const readRuntime = (runtimeAccess: IToolSurfaceRuntimeAccess) => {
	const runtime = runtimeAccess.get();
	if (runtime === undefined) {
		throw new Error('Tool surface runtime is not initialized yet.');
	}
	return runtime;
};

export const buildProjectContextToolRegistration = (input: {
	namespacePrefix: string;
	runtimeAccess: IToolSurfaceRuntimeAccess;
	workspaceRoot: string;
	corePaths: ICorePaths;
	configIssues: readonly string[];
}): IToolRegistration => ({
	id: 'project_context',
	summary:
		'Cheap project context: workspace, surface mode, config issues, loaded plugins and visible domains.',
	tags: ['orientation', 'lazy'],
	register: async (server) => {
		server.registerTool(
			`${input.namespacePrefix}_project_context`,
			{
				description:
					'Read-only project context: workspace root, resolved core paths, current surface mode, config issues, loaded plugins and visible domains.',
				inputSchema: z.object({}),
				outputSchema: z.object({
					surfaceMode: z.enum([
						'managed',
						'native',
						'adaptive',
						'compact',
					]),
					workspaceRoot: z.string(),
					cacheDir: z.string().optional(),
					docsDir: z.string().optional(),
					configIssues: z.array(z.string()),
					loadedPlugins: z.array(z.string()),
					warmPlugins: z.array(z.string()).optional(),
					visibleToolCount: z.number(),
					hiddenToolCount: z.number(),
					visibleDomains: z.array(z.string()),
				}),
			},
			async () =>
				toolJson(
					readRuntime(input.runtimeAccess).getProjectContext({
						workspaceRoot: input.workspaceRoot,
						cacheDir: input.corePaths.cacheDir,
						docsDir: input.corePaths.docsDir,
						configIssues: input.configIssues,
					}),
				),
		);
	},
});

export const buildToolSearchToolRegistration = (input: {
	namespacePrefix: string;
	runtimeAccess: IToolSurfaceRuntimeAccess;
}): IToolRegistration => ({
	id: 'tool_search',
	summary:
		'Search the loaded tool catalog, including tools hidden by managed/adaptive/compact surfaces.',
	tags: ['orientation', 'search'],
	register: async (server) => {
		server.registerTool(
			`${input.namespacePrefix}_tool_search`,
			{
				description:
					'Search the loaded tool catalog by query, plugin/namespace, tag, or active state. Returns callable names plus the knowledge id for the long description.',
				inputSchema: z.object({
					query: z.string().optional(),
					activeOnly: z.boolean().optional(),
					plugin: z.string().optional(),
					tag: z.string().optional(),
					limit: z.number().int().min(1).max(100).optional(),
				}),
				outputSchema: z.object({
					entries: z.array(SEARCH_ENTRY),
				}),
			},
			async (args) =>
				toolJson({
					entries: readRuntime(input.runtimeAccess).searchTools(args),
				}),
		);
	},
});

const buildPluginSurfaceMutationToolRegistration = (input: {
	toolId: 'plugin_activate' | 'plugin_deactivate';
	namespacePrefix: string;
	runtimeAccess: IToolSurfaceRuntimeAccess;
}): IToolRegistration => ({
	id: input.toolId,
	summary:
		input.toolId === 'plugin_activate'
			? "Expose one loaded plugin's named tools on the live MCP surface."
			: "Hide one loaded plugin's named tools from the live MCP surface.",
	tags: ['configuration', 'surface'],
	register: async (server) => {
		server.registerTool(
			`${input.namespacePrefix}_${input.toolId}`,
			{
				description:
					input.toolId === 'plugin_activate'
						? 'Activate one loaded plugin on the live MCP surface. Uses the loaded plugin id or namespace, enables its named tools and triggers tools/list_changed through the SDK.'
						: 'Deactivate one loaded plugin on the live MCP surface. Uses the loaded plugin id or namespace, hides its named tools and triggers tools/list_changed through the SDK.',
				inputSchema: z.object({ plugin: z.string() }),
				outputSchema: z.object({ change: PLUGIN_CHANGE.nullable() }),
			},
			async (args: { plugin: string }) => {
				const runtime = readRuntime(input.runtimeAccess);
				const change =
					input.toolId === 'plugin_activate'
						? await (runtime.activatePluginAsync?.(args.plugin) ??
								runtime.activatePlugin(args.plugin))
						: runtime.deactivatePlugin(args.plugin);
				if (change === null) {
					return toolError(
						`Unknown loaded plugin or namespace "${args.plugin}".`,
						'Call tool_search or project_context to inspect the current surface.',
					);
				}
				return toolJson({
					change: {
						...change,
						...(input.toolId === 'plugin_activate'
							? {
									note: 'Plugin activated. Refresh tools/list before invoking a newly visible tool; clients with a cached catalog may otherwise report it as disabled.',
								}
							: {}),
					},
				});
			},
		);
	},
});

export const buildPluginActivateToolRegistration = (input: {
	namespacePrefix: string;
	runtimeAccess: IToolSurfaceRuntimeAccess;
}): IToolRegistration =>
	buildPluginSurfaceMutationToolRegistration({
		toolId: 'plugin_activate',
		...input,
	});

export const buildPluginDeactivateToolRegistration = (input: {
	namespacePrefix: string;
	runtimeAccess: IToolSurfaceRuntimeAccess;
}): IToolRegistration =>
	buildPluginSurfaceMutationToolRegistration({
		toolId: 'plugin_deactivate',
		...input,
	});
