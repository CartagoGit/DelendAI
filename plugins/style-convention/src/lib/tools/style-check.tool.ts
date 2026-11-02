import z from 'zod';

import type { IToolRegistration } from '@delendai/core/contracts';
import { toolError, toolJson } from '@delendai/core/public';

import { checkStyle } from '../check/style-check.service';
import type { IStyleToolOptions } from '../contracts/interfaces/style-workspace.interface';
import { architectureFor } from '../profile/style-profile.service';
import { STYLE_ARCHITECTURES } from '../contracts/constants/style-profile.constant';
import { invalidArguments } from './style-envelope.helper';

const INPUT = z
	.object({
		/** The stylesheet, relative to the workspace. */
		file: z.string().min(1),
		/** The stylesheet as it would be saved; the file on disk when absent. */
		content: z.string().optional(),
	})
	.strict();

const OUTPUT = z.object({
	ok: z.literal(true),
	file: z.string(),
	architecture: z.enum(STYLE_ARCHITECTURES),
	/** Nothing the project's rules refuse. */
	clean: z.boolean(),
	findings: z.array(
		z.object({
			kind: z.string(),
			line: z.number(),
			message: z.string(),
			remedy: z.string(),
		}),
	),
});

export const buildStyleCheckTool = (
	options: IStyleToolOptions,
): IToolRegistration => ({
	id: 'style_check',
	tags: ['styles', 'design-tokens', 'read-only'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_style_check`,
			{
				description:
					'Check a stylesheet (on disk, or as `content` it would be saved with) against the project: a selector another layer owns, a second definition of one that exists, a hard-coded value an existing design token already names, a utility directive the installed version does not accept. Each finding names the reason and what to do instead. Read-only.',
				inputSchema: INPUT,
				outputSchema: OUTPUT,
			},
			async (args) => {
				const parsed = INPUT.safeParse(args);
				if (!parsed.success)
					return invalidArguments(parsed.error.issues);
				const workspace = await options.workspace();
				const { file } = parsed.data;
				const text =
					parsed.data.content ?? (await workspace.read(file));
				if (text === undefined) {
					return toolError(
						`${file} could not be read`,
						'Pass a path inside the workspace, or the stylesheet as `content`.',
						'unreadable-file',
					);
				}
				const findings = checkStyle({
					profile: workspace.profile,
					graph: workspace.graph,
					tokens: workspace.tokens,
					edit: { path: file, text },
					utilityMajor: workspace.utilityMajor,
				});
				return toolJson(
					OUTPUT.parse({
						ok: true,
						file,
						architecture: architectureFor(workspace.profile, file),
						clean: findings.length === 0,
						findings,
					}),
				);
			},
		);
	},
});
