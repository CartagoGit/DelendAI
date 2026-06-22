import { z } from 'zod';

import type {
	IToolEffect,
	IToolRegistration,
} from '../contracts/interfaces/tool-registration.interface';
import { toolJson } from '../shared/tool-response';

export interface IOverviewToolEntry {
	readonly name: string;
	readonly summary?: string | undefined;
	readonly tags?: readonly string[] | undefined;
	/** Side effects; absent ⇒ read-only. */
	readonly effects?: readonly IToolEffect[] | undefined;
}

export interface IOverviewPlugin {
	readonly name: string;
	readonly version?: string | undefined;
	readonly describe?: string | undefined;
}

export interface IOverviewSnapshot {
	readonly server: { readonly name: string; readonly version: string };
	readonly namespacePrefix: string;
	readonly corePaths: { readonly cacheDir: string; readonly docsDir: string };
	readonly pluginDiagnostic?: IOverviewPluginDiagnostic | undefined;
	readonly plugins: readonly IOverviewPlugin[];
	readonly tools: readonly IOverviewToolEntry[];
	readonly knowledge: ReadonlyArray<{
		readonly id: string;
		readonly title: string;
	}>;
	readonly recommendedNextAction: string;
}

export interface IOverviewPluginDiagnostic {
	readonly requested: readonly string[];
	readonly loaded: readonly string[];
	readonly missing: readonly string[];
	readonly configPlugins: readonly string[];
	readonly errors: number;
}

const MAX_OVERVIEW_SUMMARY_CHARS = 96;

const compactSummary = (summary: string | undefined): string | undefined => {
	if (summary === undefined) return undefined;
	if (summary.length <= MAX_OVERVIEW_SUMMARY_CHARS) return summary;
	return `${summary.slice(0, MAX_OVERVIEW_SUMMARY_CHARS - 3)}...`;
};

/**
 * The single cold-start entry point. One call returns the whole map of
 * the server — identity, loaded plugins, every tool with a one-line
 * summary, available knowledge ids, resolved paths and a recommended
 * first action — so any agent or model can orient itself in one
 * low-token round-trip instead of probing tool by tool.
 */
export const buildOverviewToolRegistration = (
	namespacePrefix: string,
	snapshot: () => IOverviewSnapshot,
): IToolRegistration => ({
	id: 'overview',
	summary:
		'Cold-start map: server identity, plugins, all tools, knowledge ids and the recommended next action. Call this first.',
	descriptionKey: 'mcp-vertex_overview',
	tags: ['orientation'],
	register: async (server) => {
		server.registerTool(
			`${namespacePrefix}_overview`,
			{
				description:
					'Cold-start map of this MCP server: identity, loaded plugins, every tool with a one-line summary, available knowledge ids, resolved paths and a recommended next action. Read-only. Call this FIRST. Use compact:true (names only) or tag to shrink the payload when there are many tools.',
				inputSchema: z.object({
					compact: z.boolean().optional(),
					tag: z.string().optional(),
				}),
				outputSchema: z.object({
					server: z.object({ name: z.string(), version: z.string() }),
					namespacePrefix: z.string(),
					corePaths: z
						.object({ cacheDir: z.string(), docsDir: z.string() })
						.optional(),
					pluginDiagnostic: z
						.object({
							requested: z.array(z.string()),
							loaded: z.array(z.string()),
							missing: z.array(z.string()),
							configPlugins: z.array(z.string()),
							errors: z.number(),
						})
						.optional(),
					plugins: z.array(
						z.union([
							z.string(),
							z.object({
								name: z.string(),
								version: z.string().optional(),
								describe: z.string().optional(),
							}),
						]),
					),
					tools: z.array(
						z.union([
							z.string(),
							z.object({
								name: z.string(),
								summary: z.string().optional(),
								tags: z.array(z.string()).optional(),
								effects: z
									.array(
										z.enum([
											'write',
											'spawn',
											'network',
											'destructive',
										]),
									)
									.optional(),
							}),
						]),
					),
					knowledge: z.array(
						z.union([
							z.string(),
							z.object({ id: z.string(), title: z.string() }),
						]),
					),
					recommendedNextAction: z.string(),
				}),
			},
			async (args: {
				compact?: boolean | undefined;
				tag?: string | undefined;
			}) => {
				const snap = snapshot();
				let tools = snap.tools;
				if (args.tag !== undefined) {
					tools = tools.filter((t) =>
						(t.tags ?? []).includes(args.tag!),
					);
				}
				if (args.compact === true) {
					return toolJson({
						server: snap.server,
						namespacePrefix: snap.namespacePrefix,
						pluginDiagnostic: snap.pluginDiagnostic,
						plugins: snap.plugins.map((p) => p.name),
						tools: tools.map((t) => t.name),
						knowledge: snap.knowledge.map((k) => k.id),
						recommendedNextAction: snap.recommendedNextAction,
					});
				}
				return toolJson({
					server: snap.server,
					namespacePrefix: snap.namespacePrefix,
					pluginDiagnostic: snap.pluginDiagnostic,
					plugins: snap.plugins.map((plugin) =>
						plugin.version === undefined
							? plugin.name
							: {
									name: plugin.name,
									...(plugin.version === undefined
										? {}
										: { version: plugin.version }),
								},
					),
					tools: tools.map((tool) =>
						tool.summary === undefined &&
						tool.tags === undefined &&
						tool.effects === undefined
							? tool.name
							: {
									name: tool.name,
									...(tool.summary === undefined
										? {}
										: {
												summary: compactSummary(
													tool.summary,
												),
											}),
									...(tool.tags === undefined
										? {}
										: { tags: tool.tags }),
									...(tool.effects === undefined
										? {}
										: { effects: tool.effects }),
								},
					),
					knowledge: snap.knowledge.map((entry) => ({
						id: entry.id,
						title: entry.title,
					})),
					recommendedNextAction: snap.recommendedNextAction,
				});
			},
		);
	},
});
