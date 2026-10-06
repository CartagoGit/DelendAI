#!/usr/bin/env bun
/**
 * collect-candidate.script.ts — drive the compiled CLI over stdio, call the
 * cheapest read-only variants we care about 3 times (to average out
 * single-run jitter), then call `metrics { persist: true }` to dump a
 * candidate snapshot the CI gate can diff against the release baseline.
 *
 * Kept separate from `diff-snapshots.script.ts` (Single Responsibility):
 * this module's only job is "produce a fresh candidate snapshot file from a
 * live server run". It does not know about thresholds or baselines.
 *
 * f00027 root cause (fixed here): the default CLI surface is
 * `--surface=managed`, which registers most tools — including the core
 * `metrics` tool itself — as disabled-until-activated. `client.listTools()`
 * under that mode returned only 6 always-on orientation tools, so the
 * `_metrics` lookup below always failed ("metrics tool not registered")
 * regardless of naming, and the observability/adaptive-optimizer plugins
 * were never even in the `swarm` preset's plugin set to begin with. Both
 * are fixed by driving the gate under `--surface=native` (every configured
 * tool eagerly registered and enabled) with the two plugins added
 * explicitly via `--plugins=`, on top of `--preset=swarm`.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import {
	PluginMetricsSnapshotSchema,
	type IPluginMetricsSnapshot,
} from './payload-percentile.schema';

const CLI = resolve('packages/core/dist/cli.js');
const REPEATS = 3;

/**
 * Plugins the `swarm` preset doesn't include by default but this gate
 * still wants metrics for. Additive with `--preset=swarm` (parseCliArgs
 * merges preset + explicit `--plugins`), so this doesn't change what
 * `swarm` means for any other caller.
 */
const EXTRA_TRACKED_PLUGINS = ['observability', 'adaptive-optimizer'];

/**
 * Real registered tool names this gate calls to collect each tracked
 * plugin's own metrics surface (`plugins/observability` and
 * `plugins/adaptive-optimizer` own both the tool and this constant — the
 * regression test in `collect-candidate.script.spec.ts` fails loudly if
 * either drifts from what the plugin actually registers).
 */
export const PLUGIN_METRICS_TOOL_SUFFIXES = [
	'_obs_runtime_metrics',
	'_activation_metrics',
] as const;

/**
 * Best-effort cheap arguments for the common read-only tools we want to track.
 * Unknown tools are skipped — the candidate collector only exercises the
 * compact/read-only surfaces that dominate long agent sessions.
 */
const compactArgsFor = (toolName: string): Record<string, unknown> => {
	if (toolName.endsWith('_overview')) return { compact: true };
	if (toolName.endsWith('_agent_catalog')) return { mode: 'compact' };
	if (toolName.endsWith('_analyze_project')) return {};
	if (toolName.endsWith('_plan_mcp_project')) return {};
	if (toolName.endsWith('_auto_work')) return {};
	if (toolName.endsWith('_compact_status')) return {};
	if (toolName.endsWith('_docs_list')) return { limit: 10 };
	if (toolName.endsWith('_search'))
		return { query: 'proposal', maxResults: 5, context: 0 };
	if (toolName.endsWith('_round_context')) return {};
	if (toolName.endsWith('_tail')) return { limit: 10 };
	if (toolName.endsWith('_obs_trace')) return { limit: 10 };
	if (toolName.endsWith('_obs_release_health')) return { limit: 10 };
	if (toolName.endsWith('_optimize_run')) {
		return {
			candidates: [{ id: 'metrics-gate-probe' }],
			budget: 1,
			consent: true,
		};
	}
	return {};
};

const isTrackedReadOnlyTool = (toolName: string): boolean =>
	toolName.endsWith('_overview') ||
	toolName.endsWith('_agent_catalog') ||
	toolName.endsWith('_analyze_project') ||
	toolName.endsWith('_plan_mcp_project') ||
	toolName.endsWith('_auto_work') ||
	toolName.endsWith('_compact_status') ||
	toolName.endsWith('_docs_list') ||
	toolName.endsWith('_search') ||
	toolName.endsWith('_round_context') ||
	toolName.endsWith('_tail') ||
	toolName.endsWith('_obs_trace') ||
	toolName.endsWith('_obs_release_health') ||
	toolName.endsWith('_optimize_run');

/** Parse an MCP `callTool` text-content result as JSON (`{}` on empty). */
const parseToolResultJson = (result: unknown): Record<string, unknown> => {
	const text =
		(result as { content?: Array<{ text?: string }> } | undefined)
			?.content?.[0]?.text ?? '{}';
	return JSON.parse(text) as Record<string, unknown>;
};

/**
 * Call every tool ending in one of `PLUGIN_METRICS_TOOL_SUFFIXES`, validate
 * each response against the shared no-samples-safe schema, and key the
 * result by tool name. A plugin that isn't loaded (or a shape the schema
 * rejects) is omitted rather than failing the whole gate — these two
 * plugins' metrics are additive signal, not a hard requirement for every
 * other tool's cost regression check.
 */
export const collectPluginMetrics = async (
	client: Client,
	tools: ReadonlyArray<{ name: string }>,
): Promise<Record<string, IPluginMetricsSnapshot>> => {
	const metricsTools = tools.filter((tool) =>
		PLUGIN_METRICS_TOOL_SUFFIXES.some((suffix) =>
			tool.name.endsWith(suffix),
		),
	);
	const collected: Record<string, IPluginMetricsSnapshot> = {};
	for (const tool of metricsTools) {
		const result = await client
			.callTool({ name: tool.name, arguments: {} })
			.catch(() => undefined);
		if (result === undefined) continue;
		const parsed = PluginMetricsSnapshotSchema.safeParse(
			parseToolResultJson(result),
		);
		if (parsed.success) collected[tool.name] = parsed.data;
	}
	return collected;
};

export const collectCandidateSnapshot = async (
	outFile: string,
): Promise<void> => {
	const workspace = mkdtempSync(join(tmpdir(), 'mcp-metrics-gate-'));
	// Run under bun, not node: only 15 of the ~50 workspace plugins get a
	// node_modules symlink (bun links a workspace only when something
	// depends on it), so node's resolver finds barely a quarter of the
	// surface and the gate silently measures a fraction of it. Bun honours
	// tsconfig.base.json's paths map, which is how every other in-repo
	// measurement resolves plugins — and bun is this repo's declared engine.
	const transport = new StdioClientTransport({
		command: 'bun',
		args: [
			CLI,
			'--preset=swarm',
			`--plugins=${EXTRA_TRACKED_PLUGINS.join(',')}`,
			'--surface=native',
			`--workspace=${workspace}`,
		],
	});
	const client = new Client(
		{ name: 'metrics-gate', version: '0.0.0' },
		{ capabilities: {} },
	);

	try {
		await client.connect(transport);
		const { tools } = await client.listTools();
		const metricsTool = tools.find((t) => t.name.endsWith('_metrics'));
		if (metricsTool === undefined) {
			throw new Error(
				'metrics tool not registered — cannot collect a candidate snapshot',
			);
		}

		// Call the compact/read-only surfaces a few times so the snapshot has
		// real per-tool averages rather than a single sample. Keep this list
		// deliberately narrow and side-effect free.
		const readOnlyTools = tools.filter((t) =>
			isTrackedReadOnlyTool(t.name),
		);
		for (let i = 0; i < REPEATS; i += 1) {
			for (const tool of readOnlyTools) {
				await client
					.callTool({
						name: tool.name,
						arguments: compactArgsFor(tool.name),
					})
					.catch(() => undefined);
			}
		}

		const pluginMetrics = await collectPluginMetrics(client, tools);

		const persisted = await client.callTool({
			name: metricsTool.name,
			arguments: { persist: false },
		});
		const parsed = parseToolResultJson(persisted);

		const { writeFileAtomic } = await import(
			'../../../packages/core/src/lib/shared/atomic-write.ts'
		);
		await writeFileAtomic(
			outFile,
			`${JSON.stringify(
				{
					at: new Date().toISOString(),
					...parsed,
					pluginMetrics,
					surface: { toolsMeasured: tools.length },
				},
				null,
				2,
			)}\n`,
		);
	} finally {
		await client.close().catch(() => undefined);
		rmSync(workspace, { recursive: true, force: true });
	}
};

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) {
	const outFile =
		process.env.METRICS_CANDIDATE_PATH ??
		'.cache/delendai/metrics/candidate.json';
	collectCandidateSnapshot(outFile)
		.then(() => console.log(`✓ collect-candidate: wrote ${outFile}`))
		.catch((err: unknown) => {
			console.error(
				`✖ collect-candidate failed: ${err instanceof Error ? err.message : String(err)}`,
			);
			process.exit(1);
		});
}
