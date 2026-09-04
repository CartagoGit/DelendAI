/**
 * status.tool.ts — `<prefix>_status` (f00068 S2).
 *
 * Compact per-server subprocess rows straight from the in-memory
 * registry: `{id, declared: true, running, pid?, bootedAt?, lastError?}`.
 * Read-only and offline — it never boots, kills or probes a child, so
 * two agents polling status concurrently can never race the registry's
 * spawn step.
 */
import { toolJson, type IToolRegistration } from '@delendai/core/public';
import z from 'zod';

import type { ExternalServerRegistry } from '../subprocess/server-registry';

export interface IStatusToolOptions {
	readonly namespacePrefix: string;
	readonly registry: ExternalServerRegistry;
}

const InputSchema = z.object({});

/** Literal-precise row contract (mirrors `IServerStatusRow`). */
export const StatusRowSchema = z
	.object({
		/** The declared roster key (`plugins.external-mcps.servers.<id>`). */
		id: z.string(),
		/** Always true — only declared servers have rows. */
		declared: z.literal(true),
		/** True while a cached child transport is live. */
		running: z.boolean(),
		/** OS pid of the cached child (only while running). */
		pid: z.number().int().positive().optional(),
		/** ISO timestamp of the current child's boot (only after a boot). */
		bootedAt: z.string().optional(),
		/** Last boot/exit failure for this server (sticky until a re-boot). */
		lastError: z.string().optional(),
	})
	.strict();

export const StatusOutputSchema = z.object({
	ok: z.literal(true),
	/** One row per DECLARED server, sorted by id. */
	servers: z.array(StatusRowSchema),
});

export const buildStatusToolRegistration = (
	options: IStatusToolOptions,
): IToolRegistration => ({
	id: 'status',
	tags: ['external-mcps', 'lazy', 'subprocess'],
	summary:
		'Per-declared-server subprocess status: running, pid, bootedAt, lastError.',
	descriptionKey: 'mcp-vertex_external-mcps_status',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_status`,
			{
				description:
					'Report the lazy subprocess registry: one compact row per server declared under plugins.external-mcps.servers — {id, declared, running, pid?, bootedAt?, lastError?}. Declared servers boot lazily on their first call, so `running: false` is the normal cold state, not a fault. Read-only: never boots, kills or probes a child.',
				inputSchema: InputSchema,
				outputSchema: StatusOutputSchema,
			},
			async () => {
				return toolJson({
					ok: true,
					servers: options.registry.status(),
				});
			},
		);
	},
});
