import z from 'zod';
import type { IToolRegistration } from '@delendai/core/public';
import { toolOk } from '@delendai/core/public';
import { verifyProposalsDb, type IDbVerifyInput } from '../services/db-verify';

export const DB_VERIFY_REGISTRATION_ID = 'proposals_db_verify';
export const DB_VERIFY_TOOL_SUFFIX = 'db_verify';
export const dbVerifyInputSchema = z.object({ sourceCommit: z.string().min(1).optional() });
export const dbVerifyOutputSchema = z.object({
	digestBefore: z.string().nullable(), digestAfter: z.string().nullable(), match: z.boolean(), durationMs: z.number().int().nonnegative(), sourceCommit: z.string(),
});
export interface IDbVerifyToolOptions extends IDbVerifyInput { readonly namespacePrefix?: string; }
export const runDbVerifyTool = (options: IDbVerifyToolOptions, args: z.infer<typeof dbVerifyInputSchema>) => verifyProposalsDb({ ...options, ...(args.sourceCommit !== undefined ? { sourceCommit: args.sourceCommit } : {}) });
export const buildDbVerifyToolRegistration = (options: IDbVerifyToolOptions): IToolRegistration => ({
	id: DB_VERIFY_REGISTRATION_ID, disclosure: 'administrative', register: async (server) => {
		server.registerTool(`${options.namespacePrefix ?? 'proposals'}_${DB_VERIFY_TOOL_SUFFIX}`, { title: 'Verify the proposals database', description: 'Rebuilds the projection in a temporary database and compares its logical digest without mutating the active database.', inputSchema: dbVerifyInputSchema, outputSchema: dbVerifyOutputSchema }, async (args) => toolOk({ ...runDbVerifyTool(options, dbVerifyInputSchema.parse(args ?? {})) }));
	},
});