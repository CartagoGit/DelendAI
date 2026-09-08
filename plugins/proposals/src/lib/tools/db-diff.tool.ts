import z from 'zod';
import type { IToolRegistration } from '@delendai/core/public';
import { toolOk } from '@delendai/core/public';
import { diffProposalsDb, type IDbDiffInput } from '../services/db-diff';

export const DB_DIFF_REGISTRATION_ID = 'proposals_db_diff';
export const DB_DIFF_TOOL_SUFFIX = 'db_diff';
export const dbDiffInputSchema = z.object({ fromSha: z.string().min(1), untilSha: z.string().min(1) });
export const dbDiffOutputSchema = z.object({ fromSha: z.string(), untilSha: z.string(), entries: z.array(z.object({ path: z.string(), fromDigest: z.string().nullable(), untilDigest: z.string().nullable(), change: z.enum(['added', 'removed', 'changed', 'unchanged']) })) });
export interface IDbDiffToolOptions extends Pick<IDbDiffInput, 'proposalsDirAbs'> { readonly namespacePrefix?: string; }
export const runDbDiffTool = (options: IDbDiffToolOptions, args: z.infer<typeof dbDiffInputSchema>) => diffProposalsDb({ proposalsDirAbs: options.proposalsDirAbs, fromSha: args.fromSha, untilSha: args.untilSha });
export const buildDbDiffToolRegistration = (options: IDbDiffToolOptions): IToolRegistration => ({
	id: DB_DIFF_REGISTRATION_ID, disclosure: 'administrative', register: async (server) => {
		server.registerTool(`${options.namespacePrefix ?? 'proposals'}_${DB_DIFF_TOOL_SUFFIX}`, { title: 'Diff proposals database snapshots', description: 'Returns a canonical digest diff for two source SHA snapshots without mutating the active database.', inputSchema: dbDiffInputSchema.shape, outputSchema: dbDiffOutputSchema.shape }, async (args) => toolOk({ ...runDbDiffTool(options, dbDiffInputSchema.parse(args ?? {})) }));
	},
});