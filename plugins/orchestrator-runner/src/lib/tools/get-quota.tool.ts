/**
 * get-quota.tool.ts — `<prefix>_get_quota`.
 *
 * Reads the quota snapshot at `${cacheDir}/orchestrator-runner/quotas.json`
 * and returns it. In S4 this file is a placeholder — the 3-source quota
 * merge that WRITES it lands in S5 (bootstrap/quota). The tool tolerates a
 * missing/corrupt file by returning an empty, well-typed snapshot with a
 * `note` rather than erroring: a quota miss must never break a routing
 * conversation. Read-only (no effects).
 */
import { toolJson, type IToolRegistration } from '@delendai/core/public';
import z from 'zod';

import { readQuotaSnapshot } from '../quota/read-quota';
import { GetQuotaOutputSchema } from '../schemas';

export interface IGetQuotaToolOptions {
	readonly namespacePrefix: string;
	readonly quotasPath: string;
}

const InputSchema = z.object({});

export const buildGetQuotaRegistration = (
	options: IGetQuotaToolOptions,
): IToolRegistration => ({
	id: 'get_quota',
	tags: ['orchestrator-runner', 'lazy', 'quota'],
	summary:
		'Read the per-provider quota snapshot (populated by the bootstrap layer in a later slice).',
	descriptionKey: 'mcp-vertex_orchestrator-runner_get_quota',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_get_quota`,
			{
				description:
					'Read the recorded per-provider quota snapshot (limits, usage and reset times per window). The snapshot is written by the bootstrap/quota layer in a later slice; until then this returns {present:false} with an empty roster and a note, never an error — a quota miss must not break routing.',
				inputSchema: InputSchema,
				outputSchema: GetQuotaOutputSchema,
			},
			async () => {
				const snapshot = await readQuotaSnapshot(options.quotasPath);
				return toolJson({
					present: snapshot.present,
					updatedAt: snapshot.updatedAt,
					providers: snapshot.providers,
					...(snapshot.present
						? {}
						: {
								note: 'No quota snapshot yet. Run the bootstrap/quota layer (a later slice) to populate it.',
							}),
				});
			},
		);
	},
});
