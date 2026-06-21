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
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const CLI = resolve('packages/core/dist/cli.js');
const REPEATS = 3;

/**
 * Best-effort cheap arguments for the common read-only tools we want to track.
 * Unknown tools are skipped — the candidate collector only exercises the
 * compact/read-only surfaces that dominate long agent sessions.
 */
const compactArgsFor = (toolName: string): Record<string, unknown> => {
	if (toolName.endsWith('_overview')) return { compact: true };
	if (toolName.endsWith('_auto_work')) return {};
	if (toolName.endsWith('_compact_status')) return {};
	if (toolName.endsWith('_docs_list')) return { limit: 10 };
	if (toolName.endsWith('_search'))
		return { query: 'proposal', maxResults: 5, context: 0 };
	if (toolName.endsWith('_round_context')) return {};
	if (toolName.endsWith('_tail')) return { limit: 10 };
	return {};
};

const isTrackedReadOnlyTool = (toolName: string): boolean =>
	toolName.endsWith('_overview') ||
	toolName.endsWith('_auto_work') ||
	toolName.endsWith('_compact_status') ||
	toolName.endsWith('_docs_list') ||
	toolName.endsWith('_search') ||
	toolName.endsWith('_round_context') ||
	toolName.endsWith('_tail');

export const collectCandidateSnapshot = async (
	outFile: string,
): Promise<void> => {
	const workspace = mkdtempSync(join(tmpdir(), 'mcp-metrics-gate-'));
	const transport = new StdioClientTransport({
		command: 'node',
		args: [CLI, '--preset=swarm', `--workspace=${workspace}`],
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

		const persisted = await client.callTool({
			name: metricsTool.name,
			arguments: { persist: false },
		});
		const text =
			(persisted.content as Array<{ text?: string }> | undefined)?.[0]
				?.text ?? '{}';

		const { writeFileAtomic } = await import(
			'../../../packages/core/src/lib/shared/atomic-write.ts'
		);
		const parsed = JSON.parse(text) as Record<string, unknown>;
		await writeFileAtomic(
			outFile,
			`${JSON.stringify({ at: new Date().toISOString(), ...parsed }, null, 2)}\n`,
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
		process.env.METRICS_CANDIDATE_PATH ?? 'metrics-candidate.json';
	collectCandidateSnapshot(outFile)
		.then(() => console.log(`✓ collect-candidate: wrote ${outFile}`))
		.catch((err: unknown) => {
			console.error(
				`✖ collect-candidate failed: ${err instanceof Error ? err.message : String(err)}`,
			);
			process.exit(1);
		});
}
