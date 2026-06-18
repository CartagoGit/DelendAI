import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolJson } from '@mcp-vertex/core/public';

import {
	loadLockSnapshot,
	reportBackpressure,
} from '../agents/persistent-task-queue';
import type { IPersistentTaskQueue } from '../agents/persistent-task-queue';

export interface ICompactStatusOptions {
	readonly namespacePrefix: string;
	readonly lockPathAbs: string;
	readonly queuePathAbs: string;
	readonly closedTasksPathAbs: string;
	readonly indexPathAbs: string;
}

type IField = 'locks' | 'queue' | 'proposals';
const ALL_FIELDS: readonly IField[] = ['locks', 'queue', 'proposals'];

export interface ICompactStatus {
	readonly locks?: { readonly active: number };
	readonly queue?: {
		readonly queued: number;
		readonly promoted: number;
		readonly waiterOrphans: number;
		readonly threshold: string;
	};
	readonly proposals?: {
		readonly total: number;
		readonly actionable: number;
		readonly byStatus: Record<string, number>;
	};
}

// Async file read (H2): tolerant — missing/corrupt → null.
const readJsonOrNull = async <T>(path: string): Promise<T | null> => {
	try {
		return JSON.parse(await readFile(path, 'utf8')) as T;
	} catch {
		return null;
	}
};

const readQueueTolerant = async (
	path: string
): Promise<IPersistentTaskQueue> => {
	const p = await readJsonOrNull<{ entries?: unknown }>(path);
	return p && Array.isArray(p.entries)
		? (p as IPersistentTaskQueue)
		: { version: 1, entries: [] };
};

const ACTIONABLE = ['pending', 'ready', 'in_progress'];

/**
 * Aggregate ONLY the proposals plugin's own coordination state — locks,
 * task queue and the proposal board — into one tiny payload, so an agent
 * checks "where are we" in a single call instead of three. `fields`
 * narrows it further. mcp-core stays agnostic: core doesn't know about
 * proposals, so this aggregator lives in the plugin that owns the state. [N17]
 */
export const collectCompactStatus = async (
	options: ICompactStatusOptions,
	fields: readonly IField[] = ALL_FIELDS
): Promise<ICompactStatus> => {
	const want = new Set(fields);
	const out: {
		locks?: { active: number };
		queue?: {
			queued: number;
			promoted: number;
			waiterOrphans: number;
			threshold: string;
		};
		proposals?: {
			total: number;
			actionable: number;
			byStatus: Record<string, number>;
		};
	} = {};

	if (want.has('locks') || want.has('queue')) {
		const snapshot = await loadLockSnapshot(
			options.lockPathAbs,
			options.closedTasksPathAbs
		);
		if (want.has('locks')) {
			out.locks = { active: snapshot.in_flight.length };
		}
		if (want.has('queue')) {
			const bp = reportBackpressure(
				await readQueueTolerant(options.queuePathAbs),
				snapshot
			);
			out.queue = {
				queued: bp.queuedCount,
				promoted: bp.promotedCount,
				waiterOrphans: bp.waiterOrphans,
				threshold: bp.threshold,
			};
		}
	}

	if (want.has('proposals')) {
		let byStatus: Record<string, number> = {};
		let total = 0;
		// torn/missing index → zeros (state_health surfaces corruption)
		const index = await readJsonOrNull<{
			proposals?: Array<{ status?: string }>;
		}>(options.indexPathAbs);
		if (index !== null) {
			const list = index.proposals ?? [];
			total = list.length;
			byStatus = list.reduce<Record<string, number>>((acc, p) => {
				const k = p.status ?? 'unknown';
				acc[k] = (acc[k] ?? 0) + 1;
				return acc;
			}, {});
		}
		const actionable = ACTIONABLE.reduce(
			(n, s) => n + (byStatus[s] ?? 0),
			0
		);
		out.proposals = { total, actionable, byStatus };
	}

	return out;
};

export const buildCompactStatusRegistration = (
	options: ICompactStatusOptions
): IToolRegistration => ({
	id: 'compact_status',
	summary:
		'One-call low-token snapshot of the swarm: active locks, queue backpressure and proposal board counts.',
	tags: ['coordination', 'orientation', 'lazy'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_compact_status`,
			{
				description:
					'Aggregates the proposals plugin state in ONE low-token call: active locks, queue backpressure (queued/promoted/waiterOrphans/threshold) and proposal counts by status. Use `fields` (["locks","queue","proposals"]) to shrink it further. Read-only.',
				inputSchema: z.object({
					fields: z.array(z.enum(['locks', 'queue', 'proposals'])).optional(),
				}),
				outputSchema: z.object({
					locks: z.object({ active: z.number() }).optional(),
					queue: z
						.object({
							queued: z.number(),
							promoted: z.number(),
							waiterOrphans: z.number(),
							threshold: z.string(),
						})
						.optional(),
					proposals: z
						.object({
							total: z.number(),
							actionable: z.number(),
							byStatus: z.record(z.string(), z.number()),
						})
						.optional(),
				}),
			},
			async (args: {
				fields?: Array<'locks' | 'queue' | 'proposals'> | undefined;
			}) => {
				const fields =
					args.fields && args.fields.length > 0
						? args.fields
						: ALL_FIELDS;
				return toolJson(await collectCompactStatus(options, fields));
			}
		);
	},
});
