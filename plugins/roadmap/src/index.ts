/**
 * @delendai/roadmap — versioned roadmap: entries with a kind and gates, a
 * git-tracked authority file and an append-only timeline, and the tools
 * that read and change them.
 *
 * A project that declares no roadmap file gets no tool and no
 * diagnostic: the plugin's defaults are nobody's roadmap.
 */
import { resolve } from 'node:path';

import { definePlugin } from '@delendai/core/plugin';
import { callerCheckout } from '@delendai/core/public';
import { SafeWorkspaceReader } from '@delendai/core/runtime';

import { roadmapOptionsSchema } from './lib/contracts/schemas/roadmap-options.schema';
import { buildRoadmapDeltaTool } from './lib/tools/delta.tool';
import { buildRoadmapPlanCloseTool } from './lib/tools/plan-close.tool';
import { buildRoadmapPlanInitTool } from './lib/tools/plan-init.tool';
import { buildRoadmapPromotionTool } from './lib/tools/promotion.tool';
import { buildRoadmapReadinessTool } from './lib/tools/readiness.tool';
import { buildRoadmapShowTool } from './lib/tools/show.tool';
import { buildRoadmapSyncTool } from './lib/tools/sync.tool';
import { openRoadmapWorkspace } from './lib/workspace/roadmap-workspace.service';

export * from './public/index';

export default definePlugin({
	name: 'roadmap',
	version: '0.1.0',
	describe:
		'Versioned roadmap: what each target version promises, what of it is delivered, whether it can be promoted, and the bump its promises imply. Read tools plus init and close; it never bumps, merges, pushes or tags.',
	optionsSchema: roadmapOptionsSchema,
	availability: (ctx) =>
		roadmapOptionsSchema.safeParse(ctx.options ?? {}).data?.file ===
		undefined
			? {
					state: 'needs-configuration',
					missing:
						'no roadmap file is declared, so it serves no tools',
					fix: 'set plugins.roadmap.options.file',
				}
			: { state: 'registered' },
	// Read-only: the declared roadmap is there to be read.
	probe: async (ctx) => {
		const file = roadmapOptionsSchema.safeParse(ctx.options ?? {}).data
			?.file;
		if (file === undefined) return;
		await new SafeWorkspaceReader(ctx.workspace.root).readText(file);
	},
	async register(ctx) {
		const parsed = roadmapOptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`roadmap plugin rejected its options: ${parsed.error.message}`,
			);
		}
		const { file } = parsed.data;
		// No roadmap declared: nothing to serve, and nothing to say.
		if (file === undefined) return { tools: [] };
		// The docs directory arrives relative to the workspace, so it
		// follows whichever checkout the call is bound to.
		const openIn = (workspaceRoot: string) =>
			openRoadmapWorkspace({
				workspaceRoot,
				docsDir: resolve(workspaceRoot, ctx.docsDir),
				options: { ...parsed.data, file },
			});
		const served = await openIn(ctx.workspace.root);
		if (!served.ok) {
			throw new Error(`roadmap plugin: ${served.reason}`);
		}
		const options = {
			namespacePrefix: ctx.namespacePrefix,
			// A call bound to an agent's checkout reads and writes there.
			workspace: async () => {
				const root = callerCheckout.executionRootOr(ctx.workspace.root);
				if (root === ctx.workspace.root) return served.value;
				const mine = await openIn(root);
				// Never the server's workspace instead: a writer answered there
				// would change a checkout the caller did not name.
				if (!mine.ok)
					throw new Error(
						`roadmap: the checkout this call is bound to (${root}) could not be opened: ${mine.reason}`,
					);
				return mine.value;
			},
			...(ctx.developmentPolicy === undefined
				? {}
				: {
						branches: {
							integration:
								ctx.developmentPolicy.branches.integration,
							release: ctx.developmentPolicy.branches.release,
						},
					}),
		};
		return {
			tools: [
				buildRoadmapShowTool(options),
				buildRoadmapSyncTool(options),
				buildRoadmapReadinessTool(options),
				buildRoadmapDeltaTool(options),
				buildRoadmapPlanInitTool(options),
				buildRoadmapPlanCloseTool(options),
				buildRoadmapPromotionTool(options),
			],
		};
	},
});
