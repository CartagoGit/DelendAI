import z from 'zod';
import type { IToolRegistration } from '@delendai/core/public';
import { toolJson } from '@delendai/core/public';
import { resurrectEntity, type IResurrectInput } from '../services/resurrect';

export const RESURRECT_REGISTRATION_ID = 'proposals_db_resurrect';
export const resurrectInputSchema = z.object({
	uid: z.string().min(1),
	note: z.string().min(1),
});
export const resurrectOutputSchema = z.object({
	uid: z.string(), entityType: z.enum(['proposal', 'plan', 'slice']),
	revision: z.number().int().nonnegative(), sourcePath: z.string().nullable(),
	lifecycleEventId: z.number().int().positive(),
});

export interface IResurrectToolOptions {
	readonly workspaceRoot: string;
	readonly namespacePrefix?: string;
}

export const runResurrectTool = (
	options: IResurrectToolOptions,
	args: z.infer<typeof resurrectInputSchema>,
) => resurrectEntity({
		workspaceRoot: options.workspaceRoot,
		uid: args.uid,
		note: args.note,
	});

export const buildResurrectToolRegistration = (
	options: IResurrectToolOptions,
): IToolRegistration => ({
	id: RESURRECT_REGISTRATION_ID,
	disclosure: 'administrative',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix ?? 'proposals'}_db_resurrect`,
			{
				title: 'Resurrect a proposal entity',
				description: 'Explicitly clears one tombstone and appends an audit lifecycle event. Never resurrects other entities.',
				inputSchema: resurrectInputSchema,
				outputSchema: resurrectOutputSchema,
			},
			async (args) => toolJson({
				...runResurrectTool(
					options,
					resurrectInputSchema.parse(args ?? {}),
				),
			}),
		);
	},
});