import { definePlugin } from '@delendai/core/public';
import z from 'zod';

import { buildPerfBenchRegistration } from './lib/tools/perf-bench.tool';
import { buildPerfBundleRegistration } from './lib/tools/perf-bundle.tool';
import { buildPerfProfileRegistration } from './lib/tools/perf-profile.tool';

/**
 * Perf plugin. `perf_bench` derives ops/s from injected samples and compares
 * against an optional inline baseline; `perf_bundle` measures build output;
 * `perf_profile` captures bounded hotspot summaries when a profiler is
 * available. Offline, read-only.
 */
const OptionsSchema = z.object({});

export default definePlugin({
	name: 'perf',
	version: '0.1.1',
	describe:
		'Performance guards: perf_bench derives ops/s from benchmark samples and optional baselines, perf_bundle flags bundle-size budget regressions, and perf_profile captures bounded hotspot summaries. Offline.',
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
				buildPerfProfileRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRootAbs: ctx.workspace.root,
					pluginCacheDir: ctx.pluginCacheDir,
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
						'',
						`Tool: \`${ctx.namespacePrefix}_perf_profile\` — capture a bounded hotspot summary when a profiler is available.`,
						'',
						'- Defaults to the workspace root and a short bounded timeout.',
						'- Returns normalized hotspots plus summary/worst severity for metrics-style gates.',
						'- If no profiler toolchain is present, it returns `ok: skipped` with an install hint instead of crashing.',
					].join('\n'),
				},
			],
		};
	},
});
