import { definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

import { buildPerfBenchRegistration } from './lib/tools/perf-bench.tool';
import { buildPerfBundleRegistration } from './lib/tools/perf-bundle.tool';

/**
 * Perf plugin. `perf_bench` derives ops/s from injected samples and compares
 * against an optional inline baseline; `perf_bundle` measures build output and
 * flags bundle-size budget regressions. Offline, read-only.
 */
const OptionsSchema = z.object({});

export default definePlugin({
	name: 'perf',
	version: '0.1.0',
	describe:
		'Performance guards: perf_bench derives ops/s from benchmark samples and optional baselines, while perf_bundle flags bundle-size budget regressions. Offline.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		return {
			tools: [
				buildPerfBenchRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRootAbs: ctx.workspace.root,
				}),
				buildPerfBundleRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRootAbs: ctx.workspace.root,
				}),
			],
			knowledge: [
				{
					id: 'perf-usage',
					title: 'Performance guards',
					body: [
						'# Performance guards',
						'',
						`Tool: \
						\`${ctx.namespacePrefix}_perf_bench\` — derive ops/s from benchmark samples and compare to an inline baseline.`,
						'',
						'- Pass named sample sets in milliseconds; the tool reports mean, p95 and derived ops/s.',
						'- Provide `baseline.entries[name].ops` to flag regressions below `1 - threshold`.',
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
