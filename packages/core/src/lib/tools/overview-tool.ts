import { z } from 'zod';

import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import { toolJson } from '../shared/tool-response';

export interface IOverviewToolEntry {
	readonly name: string;
	readonly summary?: string | undefined;
	readonly tags?: readonly string[] | undefined;
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
	readonly plugins: readonly IOverviewPlugin[];
	readonly tools: readonly IOverviewToolEntry[];
	readonly knowledge: ReadonlyArray<{ readonly id: string; readonly title: string }>;
	readonly recommendedNextAction: string;
}

/**
 * The single cold-start entry point. One call returns the whole map of
 * the server — identity, loaded plugins, every tool with a one-line
 * summary, available knowledge ids, resolved paths and a recommended
 * first action — so any agent or model can orient itself in one
 * low-token round-trip instead of probing tool by tool.
 */
export const buildOverviewToolRegistration = (
	namespacePrefix: string,
	snapshot: () => IOverviewSnapshot
): IToolRegistration => ({
	id: 'overview',
	summary:
		'Cold-start map: server identity, plugins, all tools, knowledge ids and the recommended next action. Call this first.',
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
			},
			async (args: {
				compact?: boolean | undefined;
				tag?: string | undefined;
			}) => {
				const snap = snapshot();
				let tools = snap.tools;
				if (args.tag !== undefined) {
					tools = tools.filter((t) => (t.tags ?? []).includes(args.tag!));
				}
				if (args.compact === true) {
					return toolJson({
						server: snap.server,
						namespacePrefix: snap.namespacePrefix,
						plugins: snap.plugins.map((p) => p.name),
						tools: tools.map((t) => t.name),
						knowledge: snap.knowledge.map((k) => k.id),
						recommendedNextAction: snap.recommendedNextAction,
					});
				}
				return toolJson({ ...snap, tools });
			}
		);
	},
});
