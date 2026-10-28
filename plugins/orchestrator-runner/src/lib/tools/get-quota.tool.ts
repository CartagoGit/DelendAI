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
import { toolJson } from '@delendai/core/public';
import type { IToolRegistration } from '@delendai/core/contracts';
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
		'Read what each account has left per window, as its providers reported it on their last calls.',
	descriptionKey: 'delendai_orchestrator-runner_get_quota',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_get_quota`,
			{
				description:
					"Read the recorded per-provider quota snapshot (limits, usage and reset times per window). Each call through invoke writes what its provider reports (rate-limit headers, or the vendor's own quota command such as `mmx quota show`) into the groups of the account it runs on, so the snapshot is empty until a provider on a declared account has been called. Returns {present:false} with a note saying what to declare, never an error — a quota miss must not break routing.",
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
								note: 'No quota recorded yet: it is written by calls through invoke to providers that run on a declared account. Declare the accounts with `delendai accounts offer`, then route work through invoke.',
							}),
				});
			},
		);
	},
});
