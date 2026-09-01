import type z from 'zod';

import type { IPromptRegistration } from '@mcp-vertex/core/public';

export interface IPromptArgumentSpec {
	readonly name: string;
	readonly description: string;
	readonly required: boolean;
}

export interface ITemplatedPromptRegistration<TArgs>
	extends IPromptRegistration {
	readonly name: string;
	readonly description: string;
	readonly arguments: readonly IPromptArgumentSpec[];
	readonly template: (args: TArgs) => string;
}

interface IBuildTemplatedPromptOptions<TArgs> {
	readonly namespacePrefix: string;
	readonly name: string;
	readonly description: string;
	readonly argsSchema: z.ZodType<TArgs>;
	readonly arguments: readonly IPromptArgumentSpec[];
	readonly template: (args: TArgs) => string;
}

const formatIssues = (issues: readonly z.ZodIssue[]): string[] =>
	issues.map((issue) => {
		const path = issue.path.join('.');
		return path.length > 0
			? `- ${path}: ${issue.message}`
			: `- ${issue.message}`;
	});

export const formatSelection = (
	file: string,
	startLine?: number,
	endLine?: number,
): string => {
	if (startLine === undefined && endLine === undefined) {
		return file;
	}
	if (startLine !== undefined && endLine !== undefined) {
		return `${file}:${startLine}-${endLine}`;
	}
	if (startLine !== undefined) {
		return `${file}:${startLine}`;
	}
	return `${file}:${endLine}`;
};

export const buildTemplatedPrompt = <TArgs>(
	options: IBuildTemplatedPromptOptions<TArgs>,
): ITemplatedPromptRegistration<TArgs> => ({
	id: options.name,
	name: options.name,
	description: options.description,
	arguments: options.arguments,
	template: options.template,
	register: async (server) => {
		server.registerPrompt(
			`${options.namespacePrefix}_${options.name}`,
			{
				description: options.description,
			},
			async (rawArgs: unknown) => {
				const parsed = options.argsSchema.safeParse(rawArgs ?? {});
				const text = parsed.success
					? options.template(parsed.data)
					: [
							`Prompt: ${options.name}`,
							'',
							options.description,
							'',
							'Invalid prompt arguments:',
							...formatIssues(parsed.error.issues),
						].join('\n');
				return {
					messages: [
						{
							role: 'user' as const,
							content: {
								type: 'text' as const,
								text,
							},
						},
					],
				};
			},
		);
	},
});
