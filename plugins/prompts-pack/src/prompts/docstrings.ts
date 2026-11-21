import z from 'zod';

import {
	buildTemplatedPrompt,
	type ITemplatedPromptRegistration,
} from './shared';

const DocstringsArgsSchema = z
	.object({
		file: z.string().min(1),
	})
	.strict();

export type IGenerateDocstringsArgs = z.infer<typeof DocstringsArgsSchema>;

export const buildGenerateDocstringsPrompt = (
	namespacePrefix: string,
): ITemplatedPromptRegistration<IGenerateDocstringsArgs> =>
	buildTemplatedPrompt({
		namespacePrefix,
		name: 'generate-docstrings',
		description:
			'Generate JSDoc or TSDoc for exported declarations in a file, grounded in the symbol list.',
		argsSchema: DocstringsArgsSchema,
		arguments: [
			{
				name: 'file',
				description:
					'Workspace-relative file path whose exports need docstrings.',
				required: true,
			},
		],
		template: ({ file }) =>
			[
				`Generate JSDoc or TSDoc docstrings for every exported declaration in ${file}.`,
				'',
				'Use `delendai_refactor_refactor_symbols` first to enumerate the exported functions, classes, interfaces, types, and constants before drafting comments.',
				'',
				'Rules:',
				'- Preserve the existing public API and naming.',
				'- Write concise summaries based only on visible behavior.',
				'- Document parameters, returns, throws, and side effects only when they are real and observable.',
				'- Keep formatting aligned with the file and avoid duplicate comments on already-documented exports unless the existing text is clearly stale.',
				'',
				'Return the concrete docstring edits, not a prose description of what a docstring might say.',
			].join('\n'),
	});
