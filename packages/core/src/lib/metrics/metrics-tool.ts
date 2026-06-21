/**
 * `<prefix>_metrics` meta-tool: report the per-tool metrics collected
 * this process (calls, errors, latency, response bytes). Read-only; pass
 * `reset: true` to zero the counters after reading, or `persist: true` to dump a
 * timestamped snapshot under `<cacheDir>/metrics/` for longitudinal comparison
 * across sessions/releases.
 */
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { writeFileAtomic } from '../shared/atomic-write';
import { toolJson } from '../shared/tool-response';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type { IMetricsRegistry } from './metrics-registry';

// r00001 S0 — exported so the golden snapshot test can pin the schema shape
// and document why the residual `tools: z.object({}).catchall(MetricSchema)`
// is the one documented exception in the audit.
export const MetricSchema = z.object({
	calls: z.number(),
	errors: z.number(),
	totalMs: z.number(),
	maxMs: z.number(),
	totalBytes: z.number(),
});

/** Persist a metrics snapshot to `dirAbs`; returns the path + total snapshot count. */
const persistSnapshot = async (
	dirAbs: string,
	snapshot: object,
): Promise<{ persistedTo: string; snapshots: number }> => {
	await mkdir(dirAbs, { recursive: true });
	const at = new Date().toISOString();
	const file = join(dirAbs, `${at.replace(/[:.]/g, '-')}.json`);
	await writeFileAtomic(file, `${JSON.stringify({ at, ...snapshot })}\n`);
	const snapshots = (await readdir(dirAbs)).filter((f) =>
		f.endsWith('.json'),
	).length;
	return { persistedTo: file, snapshots };
};

export const buildMetricsToolRegistration = (
	namespacePrefix: string,
	registry: IMetricsRegistry,
	/** Absolute dir for `persist: true` snapshots. Omit to disable persistence. */
	persistDirAbs?: string,
): IToolRegistration => ({
	id: 'metrics',
	summary:
		'Per-tool call metrics: calls, errors, latency (ms) and response bytes.',
	tags: ['observability', 'lazy'],
	// `persist: true` writes a snapshot file; read-only otherwise.
	effects: ['write'],
	register: async (server) => {
		server.registerTool(
			`${namespacePrefix}_metrics`,
			{
				description:
					'Return per-tool metrics collected this process: calls, errors, total/max latency (ms) and response bytes, plus totals. Read-only; pass reset:true to zero the counters after reading, or persist:true to dump a timestamped snapshot under <cacheDir>/metrics/ for longitudinal comparison. Quantifies tool cost (e.g. token savings of compact responses).',
				inputSchema: z.object({
					reset: z.boolean().optional(),
					persist: z.boolean().optional(),
				}),
				outputSchema: z.object({
					tools: z.object({}).catchall(MetricSchema),
					totals: z.object({
						calls: z.number(),
						errors: z.number(),
						totalMs: z.number(),
						totalBytes: z.number(),
					}),
					persistedTo: z.string().optional(),
					snapshots: z.number().optional(),
				}),
			},
			async (args: {
				reset?: boolean | undefined;
				persist?: boolean | undefined;
			}) => {
				// Snapshot BEFORE an optional reset so the caller sees the data.
				const snapshot = registry.snapshot();
				if (args.reset === true) registry.reset();
				if (args.persist === true && persistDirAbs !== undefined) {
					const { persistedTo, snapshots } = await persistSnapshot(
						persistDirAbs,
						snapshot,
					);
					return toolJson({ ...snapshot, persistedTo, snapshots });
				}
				return toolJson(snapshot);
			},
		);
	},
});
