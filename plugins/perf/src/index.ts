import { definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

import { buildPerfBundleRegistration } from './lib/tools/perf-bundle.tool';

/**
 * Perf plugin. `perf_bundle` measures files matching globs and flags any that
 * exceed a per-file or total byte budget — a CI-gateable guard against bundle
 * bloat. Offline, read-only. Load with `mcp-vertex --plugins=perf`.
 */
const OptionsSchema = z.object({});

export default definePlugin({
	name: 'perf',
	version: '0.1.0',
	describe:
		'Performance budgets: perf_bundle measures build-output files by glob and flags any over a per-file or total size budget. Offline.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		return {
			tools: [
				buildPerfBundleRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRootAbs: ctx.workspace.root,
				}),
			],
			knowledge: [
				{
					id: 'perf-usage',
					title: 'Bundle-size budgets',
					body: [
						'# Bundle-size budgets',
						'',
						`Tool: \`${ctx.namespacePrefix}_perf_bundle\` — measure build output against size budgets (offline).`,
						'',
						'- Matches files by `globs` (default `dist/**/*.js`) and reports the largest first.',
						'- Flags any file over `maxFileKb` (file-over-budget) and a total over `maxTotalKb` (total-over-budget).',
						'- With no budgets it just reports sizes — useful for a quick "what got big?" check.',
						'- Wire it into CI to fail the build when a bundle crosses its budget.',
					].join('\n'),
				},
			],
		};
	},
});
