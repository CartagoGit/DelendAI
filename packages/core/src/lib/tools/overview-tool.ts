import z from 'zod';

import type { IActivationReport } from '../contracts/interfaces/activation-report.interface';
import { CAPABILITY_TAGS } from '../contracts/interfaces/provider-capabilities.interface';
import type { IProviderSummary } from '../contracts/interfaces/provider-capabilities.interface';
import type { IToolSurfaceRuntimeAccess } from '../contracts/interfaces/tool-surface.interface';
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
	// r00027: surfaced so the overview tool can ask the
	// tool-surface runtime for the per-surface counts via
	// `getProjectContext({ workspaceRoot })`.
	readonly workspaceRoot: string;
	readonly corePaths: { readonly cacheDir: string; readonly docsDir: string };
	/**
	 * f00109 S1: config-file problems detected at boot — schema violations
	 * plus dead-layout findings (a docsDir or plugin `options.roots` entry
	 * that does not exist in this workspace). Absent when the config is
	 * clean, so the healthy overview pays zero bytes. When present, the
	 * agent must fix the config before doing any work: the listed paths
	 * mean plugins are scanning directories that are not there.
	 */
	readonly configIssues?: readonly string[] | undefined;
	readonly pluginDiagnostic?: IOverviewPluginDiagnostic | undefined;
	readonly plugins: readonly IOverviewPlugin[];
	readonly tools: readonly IOverviewToolEntry[];
	readonly knowledge: ReadonlyArray<{
		readonly id: string;
		readonly title: string;
	}>;
	/**
	 * f00067a S2 — multi-model provider roster from the config file's
	 * root `providers` block, projected to lean summaries. Absent when the
	 * roster is empty/unconfigured so the common single-model setup pays
	 * zero bytes. The compact overview also drops it (token economy); the
	 * live availability source of truth stays the orchestrator-runner's
	 * `healthcheck_providers` tool.
	 */
	readonly providers?: readonly IProviderSummary[] | undefined;
	/**
	 * Opt-in plugin activation detail. The handler only emits this when the
	 * caller passes `activation: true`, keeping the default overview lean.
	 */
	readonly activationReport?: IActivationReport | undefined;
	/** Enabled plugins with tools that have not been invoked this session. */
	readonly unusedActivePlugins?: readonly string[] | undefined;
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
	runtimeAccess?: IToolSurfaceRuntimeAccess,
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
					activation: z.boolean().optional(),
				}),
				outputSchema: z.object({
					server: z.object({ name: z.string(), version: z.string() }),
					namespacePrefix: z.string(),
					corePaths: z
						.object({ cacheDir: z.string(), docsDir: z.string() })
						.optional(),
					// f00109 S1: boot-time config problems (schema violations,
					// dead docsDir/roots). Omitted when the config is clean.
					configIssues: z.array(z.string()).optional(),
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
					// f00067a S2: provider roster summaries (full mode only;
					// omitted entirely when no roster is configured).
					providers: z
						.array(
							z.object({
								id: z.string(),
								kind: z.enum([
									'api',
									'subscription',
									'cli',
									'mcp-server',
								]),
								modelId: z.string(),
								// Literal union: keeps the generated SDK type
								// assignable to `CostTier`.
								costTier: z.union([
									z.literal(1),
									z.literal(2),
									z.literal(3),
									z.literal(4),
									z.literal(5),
								]),
								reachable: z.boolean(),
								strengths: z.array(z.enum(CAPABILITY_TAGS)),
							}),
						)
						.optional(),
					activationReport: z
						.object({
							entries: z.array(
								z.object({
									id: z.string(),
									origin: z.enum([
										'bundled',
										'user-local',
										'external',
									]),
									active: z.boolean(),
									source: z.enum([
										'preset',
										'config',
										'flag',
									]),
									toolCount: z.number(),
								}),
							),
							counts: z.object({
								bundled: z.number(),
								'user-local': z.number(),
								external: z.number(),
							}),
							totalTools: z.number(),
						})
						.optional(),
					unusedActivePlugins: z.array(z.string()).optional(),
					// r00027: surface mode + counts of visible vs hidden
					// tools. Lets the operator understand at a glance which
					// surface the host picked and how many tools are
					// currently announced to the MCP client vs available
					// behind `plugin_activate`. The total loaded tool count
					// is the sum of the two; that is the answer to
					// "cuántas herramientas tiene disponibles" the host
					// can give without enumerating each entry.
					projectContext: z
						.object({
							surfaceMode: z.enum([
								'managed',
								'native',
								'adaptive',
								'compact',
							]),
							visibleToolCount: z.number().int().nonnegative(),
							hiddenToolCount: z.number().int().nonnegative(),
							loadedPluginCount: z.number().int().nonnegative(),
							loadedToolCount: z.number().int().nonnegative(),
						})
						.optional(),
					recommendedNextAction: z.string(),
				}),
			},
			async (args: {
				compact?: boolean | undefined;
				tag?: string | undefined;
				activation?: boolean | undefined;
			}) => {
				const snap = snapshot();
				const runtime = runtimeAccess?.get();
				let tools = snap.tools;
				if (args.tag !== undefined) {
					tools = tools.filter((t) =>
						(t.tags ?? []).includes(args.tag!),
					);
				}
				if (runtime !== undefined) {
					tools = tools.filter((tool) =>
						runtime.isToolExposed(tool.name),
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
						// f00109 S1: config problems survive compact mode — a
						// dead config is exactly when orientation must not look
						// healthy. Omitted when clean.
						...(snap.configIssues !== undefined
							? { configIssues: snap.configIssues }
							: {}),
						// Only when the requested plugin set diverged from what
						// loaded (assemble.ts omits it on a clean boot).
						...(snap.pluginDiagnostic !== undefined
							? { pluginDiagnostic: snap.pluginDiagnostic }
							: {}),
						plugins: snap.plugins.map((p) => p.name),
						tools: groupedTools,
						knowledge: snap.knowledge.map((k) => k.id),
						...(args.activation === true &&
						snap.activationReport !== undefined
							? { activationReport: snap.activationReport }
							: {}),
						...(snap.unusedActivePlugins?.length
							? { unusedActivePlugins: snap.unusedActivePlugins }
							: {}),
						// r00027: surface mode + tool counts (compact mode
						// also surfaces them — the operator needs to know
						// the totals even when they ask for the grouped
						// view).
						...(runtime !== undefined
							? (() => {
									const ctx = runtime.getProjectContext({
										workspaceRoot: snap.workspaceRoot,
										...(snap.corePaths?.cacheDir !==
										undefined
											? {
													cacheDir:
														snap.corePaths.cacheDir,
												}
											: {}),
										...(snap.corePaths?.docsDir !==
										undefined
											? {
													docsDir:
														snap.corePaths.docsDir,
												}
											: {}),
										...(snap.configIssues !== undefined
											? {
													configIssues:
														snap.configIssues,
												}
											: {}),
									});
									const visibleToolCount =
										ctx.visibleToolCount;
									const hiddenToolCount = ctx.hiddenToolCount;
									return {
										projectContext: {
											surfaceMode: ctx.surfaceMode,
											visibleToolCount,
											hiddenToolCount,
											loadedPluginCount:
												ctx.loadedPlugins.length,
											loadedToolCount:
												visibleToolCount +
												hiddenToolCount,
										},
									};
								})()
							: {}),
						recommendedNextAction: snap.recommendedNextAction,
					});
				}
				return toolJson({
					server: snap.server,
					namespacePrefix: snap.namespacePrefix,
					...(snap.configIssues !== undefined
						? { configIssues: snap.configIssues }
						: {}),
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
					// Roster only in full mode; compact mode drops it (the id
					// list alone is not actionable without kind/costTier).
					...(snap.providers !== undefined
						? { providers: snap.providers }
						: {}),
					...(args.activation === true &&
					snap.activationReport !== undefined
						? { activationReport: snap.activationReport }
						: {}),
					...(snap.unusedActivePlugins?.length
						? { unusedActivePlugins: snap.unusedActivePlugins }
						: {}),
					// r00027: surface mode + tool counts. The operator's
					// first call to `overview` is the canonical place to
					// answer "how many tools does this server have right
					// now, and how would I get more?".
					...(runtime !== undefined
						? (() => {
								const ctx = runtime.getProjectContext({
									workspaceRoot: snap.workspaceRoot,
									...(snap.corePaths?.cacheDir !== undefined
										? { cacheDir: snap.corePaths.cacheDir }
										: {}),
									...(snap.corePaths?.docsDir !== undefined
										? { docsDir: snap.corePaths.docsDir }
										: {}),
									...(snap.configIssues !== undefined
										? { configIssues: snap.configIssues }
										: {}),
								});
								const visibleToolCount = ctx.visibleToolCount;
								const hiddenToolCount = ctx.hiddenToolCount;
								return {
									projectContext: {
										surfaceMode: ctx.surfaceMode,
										visibleToolCount,
										hiddenToolCount,
										loadedPluginCount:
											ctx.loadedPlugins.length,
										loadedToolCount:
											visibleToolCount + hiddenToolCount,
									},
								};
							})()
						: {}),
					recommendedNextAction: snap.recommendedNextAction,
				});
			},
		);
	},
});
