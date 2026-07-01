import { z } from 'zod';

import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type { IStatusCollector } from '../contracts/interfaces/status-collector.interface';
import { toolJson } from '../shared/tool-response';

export interface IStatusResult {
	readonly collectors: Readonly<Record<string, unknown>>;
	readonly errors: ReadonlyArray<{
		readonly id: string;
		readonly error: string;
	}>;
}

/**
 * Aggregate every registered `IStatusCollector.collect()` into one
 * read-only status payload, keyed by collector id. A collector that
 * throws is captured in `errors` (never sinks the whole call). This is
 * the consumer that makes the `statusCollectors` host seam real: a host
 * wraps its runtime (e.g. a game loop) in a collector and this tool
 * surfaces it; the CLI also registers a built-in `mcp-vertex` collector
 * reporting loaded plugins + counts.
 */
export const collectStatus = async (
	collectors: readonly IStatusCollector[],
): Promise<IStatusResult> => {
	const out: Record<string, unknown> = {};
	const errors: Array<{ id: string; error: string }> = [];
	await Promise.all(
		collectors.map(async (c) => {
			try {
				out[c.id] = await c.collect();
			} catch (e) {
				errors.push({
					id: c.id,
					error: e instanceof Error ? e.message : String(e),
				});
			}
		}),
	);
	return { collectors: out, errors };
};

export const buildStatusToolRegistration = (
	namespacePrefix: string,
	collectors: readonly IStatusCollector[],
): IToolRegistration => ({
	id: 'status',
	summary:
		'Live runtime status from every registered status collector (host runtime + core).',
	tags: ['orientation', 'lazy'],
	register: async (server) => {
		server.registerTool(
			`${namespacePrefix}_status`,
			{
				description:
					'Aggregate the runtime status of every registered status collector (e.g. a host game-loop, plus the built-in mcp-vertex collector with loaded plugins + counts). Returns { collectors: {id: payload}, errors }. Read-only.',
				inputSchema: z.object({}),
				outputSchema: z.object({
					collectors: z.record(z.string(), z.unknown()),
					errors: z.array(
						z.object({ id: z.string(), error: z.string() }),
					),
				}),
			},
			async () => toolJson(await collectStatus(collectors)),
		);
	},
});
