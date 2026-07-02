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
	/**
	 * Owning plugin (e.g. `proposals`), or absent for core tools. Used by
	 * the compact overview to group tools under their plugin so the shared
	 * `<namespacePrefix>_<plugin>_` prefix is stated once per group instead
	 * of repeated on every entry. Not surfaced by the full overview.
	 */
	readonly plugin?: string | undefined;
	/**
	 * Unqualified tool id (e.g. `agent_lock`), i.e. `name` without the
	 * `<namespacePrefix>_<plugin>_` prefix. The compact overview lists this
	 * stem under its plugin group; the full name reconstructs as
	 * `<namespacePrefix>_<plugin>_<id>` (or `<namespacePrefix>_<id>` for core).
	 */
	readonly id?: string | undefined;
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
	/** Why each `missing` entry didn't load. Omitted when `missing` is empty. */
	readonly missingReasons?: Readonly<Record<string, string>> | undefined;
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
					'Cold-start map of this MCP server: identity, loaded plugins, every tool with a one-line summary, available knowledge ids, resolved paths and a recommended next action. Read-only. Call this FIRST. Use compact:true or tag to shrink the payload when there are many tools. In compact mode, `tools` is grouped by plugin ({ proposals: ["agent_lock", …], core: ["overview", …] }); a tool\'s callable name is `<namespacePrefix>_<plugin>_<id>` (core tools: `<namespacePrefix>_<id>`).',
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
							missingReasons: z
								.record(z.string(), z.string())
								.optional(),
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
					// Full overview: an array of per-tool entries (name +
					// summary/tags/effects). Compact overview: a record keyed by
					// plugin (`{ proposals: ['agent_lock', …], … }`, core tools
					// under `core`) so the shared `<prefix>_<plugin>_` is stated
					// once per group, not per tool.
					tools: z.union([
						z.array(
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
						z.record(z.string(), z.array(z.string())),
					]),
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
					// Group tools by owning plugin so the shared
					// `<prefix>_<plugin>_` is written once per group instead of
					// repeated on every tool name. Core tools (no plugin) go
					// under `core`. The stem is the unqualified id; the full
					// callable name reconstructs as `<prefix>_<plugin>_<id>`.
					const groupedTools: Record<string, string[]> = {};
					for (const t of tools) {
						const group = t.plugin ?? 'core';
						const stem =
							t.id ??
							(t.plugin !== undefined
								? t.name.slice(
										`${snap.namespacePrefix}_${t.plugin}_`
											.length,
									)
								: t.name.slice(
										`${snap.namespacePrefix}_`.length,
									));
						const bucket = groupedTools[group] ?? [];
						bucket.push(stem);
						groupedTools[group] = bucket;
					}
					return toolJson({
						server: snap.server,
						namespacePrefix: snap.namespacePrefix,
						// Only when the requested plugin set diverged from what
						// loaded (assemble.ts omits it on a clean boot).
						...(snap.pluginDiagnostic !== undefined
							? { pluginDiagnostic: snap.pluginDiagnostic }
							: {}),
						plugins: snap.plugins.map((p) => p.name),
						tools: groupedTools,
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
							: { name: plugin.name, version: plugin.version },
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
