import z from 'zod';
import type { IToolRegistration } from '@delendai/core/public';
import { toolOk } from '@delendai/core/public';
import { listProposalConflicts } from '../services/conflicts';

export const CONFLICTS_REGISTRATION_ID = 'proposals_conflicts';
export const CONFLICTS_TOOL_SUFFIX = 'conflicts';
export const conflictsInputSchema = z.object({});
export const conflictsOutputSchema = z.object({
	conflicts: z.array(
		z.object({
			entityType: z.enum(['proposal', 'plan', 'slice']),
			entityUid: z.string(),
			currentRevision: z.number().int(),
			expectedRevision: z.number().int(),
		}),
	),
	checkedAt: z.number().int().nonnegative(),
});
export interface IConflictsToolOptions {
	readonly workspaceRoot: string;
	readonly namespacePrefix?: string;
}
export const buildConflictsToolRegistration = (
	options: IConflictsToolOptions,
): IToolRegistration => ({
	id: CONFLICTS_REGISTRATION_ID,
	disclosure: 'administrative',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix ?? 'proposals'}_proposals_conflicts`,
			{
				title: 'List proposals database conflicts',
				description:
					'Lists entities whose current revision differs from the latest recorded lifecycle revision.',
				inputSchema: conflictsInputSchema,
				outputSchema: conflictsOutputSchema,
			},
			async () =>
				toolOk({ ...listProposalConflicts(options.workspaceRoot) }),
		);
	},
});
