import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolJson } from '@delendai/core/public';

import { createProposalSearchService } from '../services/search';
import {
	compileContext,
	type IContextCompilerDependencies,
	type IContextDocument,
} from '../services/context-compiler';

export const compileContextInputSchema = z.object({
	task: z.string().min(1),
	maxTokens: z.number().int().positive(),
	scope: z.array(z.string().min(1)).optional(),
});

export const compileContextOutputSchema = z.object({
	task: z.string(),
	maxTokens: z.number().int().positive(),
	tokens: z.number().int().nonnegative(),
	bands: z.record(
		z.enum(['L0', 'L1', 'L2', 'L3', 'L4', 'L5']),
		z.array(
			z.object({
				uid: z.string(),
				band: z.enum(['L0', 'L1', 'L2', 'L3', 'L4', 'L5']),
				text: z.string(),
				tokens: z.number().int().positive(),
				score: z.number(),
			}),
		),
	),
});

export interface ICompileContextToolOptions {
	readonly namespacePrefix: string;
	readonly dependencies: IContextCompilerDependencies;
}

export const runCompileContext = async (
	options: ICompileContextToolOptions,
	input: z.input<typeof compileContextInputSchema>,
) => {
	const parsed = compileContextInputSchema.parse(input);
	return compileContext(
		{
			task: parsed.task,
			maxTokens: parsed.maxTokens,
			...(parsed.scope === undefined ? {} : { scope: parsed.scope }),
		},
		options.dependencies,
	);
};

export const buildCompileContextToolRegistration = (
	options: ICompileContextToolOptions,
): IToolRegistration => ({
	id: 'proposals_compile_context',
	disclosure: 'contextual',
	summary: 'Compile minimal token-budgeted proposal context.',
	tags: ['proposals', 'context', 'read'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_compile_context`,
			{
				description:
					'Compile deterministic proposal context using FTS5 and cached summaries. It never calls an LLM.',
				inputSchema: compileContextInputSchema,
				outputSchema: compileContextOutputSchema,
			},
			async (input) => toolJson(await runCompileContext(options, input)),
		);
	},
});

export type { IContextDocument };