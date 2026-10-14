import z from 'zod';

import type { IToolRegistration } from '@delendai/core/contracts';
import { toolJson } from '@delendai/core/public';

import { STYLE_ARCHITECTURES } from '../contracts/constants/style-profile.constant';
import type { IStyleToolOptions } from '../contracts/interfaces/style-workspace.interface';
import { architectureFor, layerOf } from '../profile/style-profile.service';
import { invalidArguments } from './style-envelope.helper';

const INPUT = z.object({ path: z.string().min(1).optional() }).strict();

const architecture = z.enum(STYLE_ARCHITECTURES);

const OUTPUT = z.object({
	ok: z.literal(true),
	architecture,
	overrides: z.array(z.object({ glob: z.string(), architecture })),
	layers: z.array(
		z.object({
			name: z.string(),
			glob: z.string(),
			prefixes: z.array(z.string()),
		}),
	),
	tokens: z.number(),
	/** What the profile says of `path`, when one was asked about. */
	at: z
		.object({
			path: z.string(),
			architecture,
			layer: z.string().nullable(),
		})
		.optional(),
});

export const buildStyleProfileTool = (
	options: IStyleToolOptions,
): IToolRegistration => ({
	id: 'style_profile',
	tags: ['styles', 'read-only'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_style_profile`,
			{
				description:
					'The style architecture the project declares: the default, the folders with another one (a `legacy-global` folder is not drift), the layers that own selector prefixes and how many design tokens are declared. Pass `path` for what applies to one file. Read-only.',
				inputSchema: INPUT,
				outputSchema: OUTPUT,
			},
			async (args) => {
				const parsed = INPUT.safeParse(args);
				if (!parsed.success)
					return invalidArguments(parsed.error.issues);
				const { profile, tokens } = await options.workspace();
				const { path } = parsed.data;
				return toolJson(
					OUTPUT.parse({
						ok: true,
						architecture: profile.architecture,
						overrides: profile.overrides,
						layers: profile.layers,
						tokens: tokens.length,
						...(path === undefined
							? {}
							: {
									at: {
										path,
										architecture: architectureFor(
											profile,
											path,
										),
										layer: layerOf(profile, path) ?? null,
									},
								}),
					}),
				);
			},
		);
	},
});
