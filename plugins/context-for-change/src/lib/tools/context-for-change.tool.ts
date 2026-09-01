import z from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import { toolError } from '@mcp-vertex/core/public';

import {
	CONTEXT_FOR_CHANGE_SOURCES,
	type IContextForChangeToolArgs,
	type IContextForChangeToolOptions,
} from '../contracts/interfaces/context-for-change.interface';
import { runContextForChangeService } from '../services/context-for-change.service';

const InputSchema = z.object({
	files: z.array(z.string()).optional(),
	gitDiff: z.string().optional(),
	symbol: z.string().optional(),
	task: z.string().optional(),
});

const SectionSchema = z.object({
	source: z.enum(CONTEXT_FOR_CHANGE_SOURCES),
	summary: z.string(),
});

export const ContextForChangeOutputSchema = z.object({
	dependsOn: z.array(z.string()),
	files: z.array(z.string()),
	sections: z.array(SectionSchema),
	bytes: z.number(),
	truncated: z.boolean(),
	originalBytes: z.number().optional(),
});

export const runContextForChange = async (
	args: IContextForChangeToolArgs,
	options: IContextForChangeToolOptions,
) => {
	const parsed = InputSchema.safeParse(args);
	if (!parsed.success) {
		return toolError(
			parsed.error.message,
			'Pass files, gitDiff or symbol.',
		);
	}
	return runContextForChangeService(parsed.data, options);
};

export const buildContextForChangeToolRegistrations = (
	options: IContextForChangeToolOptions,
): IToolRegistration[] => [
	{
		id: 'context_for_change',
		tags: ['context', 'orchestration', 'compact'],
		summary:
			'Combine diff, symbols, tests, docs and conventions into one bounded task-oriented context packet.',
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_context_for_change`,
				{
					outputSchema: ContextForChangeOutputSchema,
					description:
						'Build a compact, task-oriented context packet from files, git diff, symbols, related tests, docs, conventions and recent memory. Reuses the public surfaces of the existing plugins instead of duplicating their logic.',
					inputSchema: InputSchema,
				},
				async (args) => runContextForChange(args, options),
			);
		},
	},
];
