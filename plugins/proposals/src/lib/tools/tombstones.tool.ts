import z from 'zod';
import type { IToolRegistration } from '@delendai/core/public';
import { toolJson } from '@delendai/core/public';
import { listTombstones, type ITombstoneRecord } from '../services/resurrect';

export const TOMBSTONES_REGISTRATION_ID = 'proposals_db_tombstones';
export const tombstonesInputSchema = z.object({});
export const tombstonesOutputSchema = z.object({
	entries: z.array(
		z.object({
			uid: z.string(),
			kind: z.string(),
			deleted_at: z.number().int(),
			last_seen_at: z.number().int().nullable(),
			last_seen_commit: z.string().nullable(),
			reason: z.string().nullable(),
			path_history: z.array(z.string()),
		}),
	),
	total: z.number().int().nonnegative(),
});

export interface ITombstonesToolOptions {
	readonly workspaceRoot: string;
	readonly namespacePrefix?: string;
}

export type ITombstonesOutput = {
	readonly entries: readonly ITombstoneRecord[];
	readonly total: number;
};

export const runTombstonesTool = (
	options: ITombstonesToolOptions,
): ITombstonesOutput => {
	const entries = listTombstones(options.workspaceRoot);
	return { entries, total: entries.length };
};

export const buildTombstonesToolRegistration = (
	options: ITombstonesToolOptions,
): IToolRegistration => ({
	id: TOMBSTONES_REGISTRATION_ID,
	disclosure: 'administrative',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix ?? 'proposals'}_proposals_db_tombstones`,
			{
				title: 'List proposal tombstones',
				description:
					'Read-only listing of entities retained after disappearance from the source tree.',
				inputSchema: tombstonesInputSchema,
				outputSchema: tombstonesOutputSchema,
			},
			async () => toolJson(runTombstonesTool(options)),
		);
	},
});
