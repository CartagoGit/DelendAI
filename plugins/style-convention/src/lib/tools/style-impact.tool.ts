import z from 'zod';

import type { IToolRegistration } from '@delendai/core/contracts';
import { toolError, toolJson } from '@delendai/core/public';

import type { IStyleToolOptions } from '../contracts/interfaces/style-workspace.interface';
import {
	impactOfFile,
	impactOfSelector,
} from '../graph/selector-graph.service';
import { invalidArguments } from './style-envelope.helper';

const INPUT = z
	.object({
		/** A class selector, with or without its dot. */
		selector: z.string().min(1).optional(),
		/** A stylesheet or markup file, relative to the workspace. */
		file: z.string().min(1).optional(),
	})
	.strict();

const OUTPUT = z.object({
	ok: z.literal(true),
	impacts: z.array(
		z.object({
			selector: z.string(),
			definedIn: z.array(z.string()),
			consumers: z.array(
				z.object({
					path: z.string(),
					package: z.string(),
					crossesBoundary: z.boolean(),
				}),
			),
			crossBoundary: z.number(),
		}),
	),
});

export const buildStyleImpactTool = (
	options: IStyleToolOptions,
): IToolRegistration => ({
	id: 'style_impact',
	tags: ['styles', 'impact', 'read-only'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_style_impact`,
			{
				description:
					'What a change to a selector, or to every selector a file defines, reaches: the files that define it, each surface that uses it, and which of those are in another package. Ask before editing a stylesheet. Read-only.',
				inputSchema: INPUT,
				outputSchema: OUTPUT,
			},
			async (args) => {
				const parsed = INPUT.safeParse(args);
				if (!parsed.success)
					return invalidArguments(parsed.error.issues);
				const { selector, file } = parsed.data;
				if ((selector === undefined) === (file === undefined)) {
					return toolError(
						'pass either `selector` or `file`, one of them',
						'A selector answers for itself; a file answers for every selector it defines.',
						'invalid-arguments',
					);
				}
				const { graph } = await options.workspace();
				if (selector !== undefined) {
					const impact = impactOfSelector(graph, selector);
					return impact === undefined
						? toolError(
								`no stylesheet defines and no markup uses .${selector.replace(/^\./u, '')}`,
								'Check the spelling, or that the stylesheet is under a declared style root.',
								'unknown-selector',
							)
						: toolJson(
								OUTPUT.parse({ ok: true, impacts: [impact] }),
							);
				}
				return toolJson(
					OUTPUT.parse({
						ok: true,
						impacts: impactOfFile(graph, file ?? ''),
					}),
				);
			},
		);
	},
});
