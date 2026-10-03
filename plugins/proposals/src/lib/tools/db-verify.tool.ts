import z from 'zod';
import type { IToolRegistration } from '@delendai/core/public';
import { withOkEnvelope } from '@delendai/core/plugin';
import { toolOk } from '@delendai/core/public';
import {
	verifyProposalsDb,
	type IDbVerifyInput,
	type IDbVerifyOutput,
} from '../services/db-verify';

export const DB_VERIFY_REGISTRATION_ID = 'proposals_db_verify';
export const DB_VERIFY_TOOL_SUFFIX = 'db_verify';
export const dbVerifyInputSchema = z.object({
	sourceCommit: z.string().min(1).optional(),
});
/** The payload; the registered schema adds the `ok` envelope `toolOk` writes. */
export const dbVerifyOutputSchema = z.object({
	digestBefore: z.string().nullable(),
	digestAfter: z.string().nullable(),
	match: z.boolean(),
	durationMs: z.number().int().nonnegative(),
	sourceCommit: z.string(),
});
export interface IDbVerifyToolOptions extends IDbVerifyInput {
	readonly namespacePrefix?: string;
	/** DIP seam for the verifier; defaults to the real one, which needs `bun:sqlite`. */
	readonly verify?: (input: IDbVerifyInput) => IDbVerifyOutput;
}
export const runDbVerifyTool = (
	options: IDbVerifyToolOptions,
	args: z.infer<typeof dbVerifyInputSchema>,
) =>
	(options.verify ?? verifyProposalsDb)({
		...options,
		...(args.sourceCommit !== undefined
			? { sourceCommit: args.sourceCommit }
			: {}),
	});
export const buildDbVerifyToolRegistration = (
	options: IDbVerifyToolOptions,
): IToolRegistration => ({
	id: DB_VERIFY_REGISTRATION_ID,
	disclosure: 'administrative',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix ?? 'proposals'}_proposals_db_verify`,
			{
				title: 'Verify the proposals database',
				description:
					'Rebuilds the projection in a temporary database and compares its logical digest without mutating the active database.',
				inputSchema: dbVerifyInputSchema,
				outputSchema: withOkEnvelope(dbVerifyOutputSchema),
			},
			async (args) =>
				toolOk({
					...runDbVerifyTool(
						options,
						dbVerifyInputSchema.parse(args ?? {}),
					),
				}),
		);
	},
});
