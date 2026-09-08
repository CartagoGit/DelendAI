import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolOk } from '@delendai/core/public';

import {
	dbRebuildPaths,
	rebuildProposalsDb,
	type IDbRebuildInput,
	type IDbRebuildOutput,
} from '../services/db-rebuild';

export const DB_REBUILD_TOOL_SUFFIX = 'db_rebuild';
export const DB_REBUILD_REGISTRATION_ID = 'proposals_db_rebuild';

export const dbRebuildInputSchema = z.object({
	apply: z.boolean().optional(),
	confirm: z.string().min(1).optional(),
	sourceCommit: z.string().min(1).optional(),
});

export const dbRebuildOutputSchema = z.object({
	status: z.enum(['ok', 'rejected']),
	created: z.boolean(),
	dryRun: z.boolean(),
	databasePath: z.string(),
	stagingPath: z.string(),
	statePath: z.string(),
	sourceCommit: z.string(),
	logicalDigest: z.string().nullable(),
	filesScanned: z.number().int().nonnegative(),
	filesReconciled: z.number().int().nonnegative(),
	proposals: z.number().int().nonnegative(),
	plans: z.number().int().nonnegative(),
	slices: z.number().int().nonnegative(),
	staged: z.object({
		proposals: z.number().int().nonnegative(),
		plans: z.number().int().nonnegative(),
		slices: z.number().int().nonnegative(),
	}),
	excluded: z.array(
		z.object({
			path: z.string(),
			code: z.string(),
			message: z.string(),
		}),
	),
	excludedCount: z.number().int().nonnegative(),
	integrity: z.enum(['ok', 'failed', 'not-run']),
	foreignKey: z.enum(['ok', 'failed', 'not-run']),
	reason: z.string().nullable(),
	startedAt: z.number().int().nonnegative(),
	durationMs: z.number().int().nonnegative(),
	applied: z.boolean(),
	proposedSha: z.string(),
	confirmationRequired: z.boolean(),
});

export const runDbRebuildTool = (
	options: Pick<IDbRebuildInput, 'workspaceRoot' | 'proposalsDirAbs'>,
	args: z.infer<typeof dbRebuildInputSchema>,
): IDbRebuildOutput =>
	rebuildProposalsDb({
		...options,
		...(args.apply !== undefined ? { apply: args.apply } : {}),
		...(args.confirm !== undefined ? { confirm: args.confirm } : {}),
		...(args.sourceCommit !== undefined
			? { sourceCommit: args.sourceCommit }
			: {}),
	});

export interface IDbRebuildToolOptions {
	readonly workspaceRoot: string;
	readonly proposalsDirAbs: string;
	readonly namespacePrefix?: string;
}

export const buildDbRebuildToolRegistration = (
	options: IDbRebuildToolOptions,
): IToolRegistration => ({
	id: DB_REBUILD_REGISTRATION_ID,
	disclosure: 'administrative',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix ?? 'proposals'}_${DB_REBUILD_TOOL_SUFFIX}`,
			{
				title: 'Rebuild the proposals database',
				description:
					'Preview a proposals database rebuild, or apply it only when --apply and --confirm match the proposed source SHA.',
				inputSchema: dbRebuildInputSchema,
				outputSchema: dbRebuildOutputSchema,
			},
			async (args) => {
				const parsed = dbRebuildInputSchema.parse(args ?? {});
				return toolOk(
					runDbRebuildTool(
						{
							workspaceRoot: options.workspaceRoot,
							proposalsDirAbs: options.proposalsDirAbs,
						},
						parsed,
					),
				);
			},
		);
	},
});

export { dbRebuildPaths };
