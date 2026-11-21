import z from 'zod';

import {
	buildTemplatedPrompt,
	formatSelection,
	type ITemplatedPromptRegistration,
} from './shared';

const ExplainArgsSchema = z
	.object({
		file: z.string().min(1),
		startLine: z.number().int().positive().optional(),
		endLine: z.number().int().positive().optional(),
	})
	.strict();

export type IExplainThisCodeArgs = z.infer<typeof ExplainArgsSchema>;

export const buildExplainThisCodePrompt = (
	namespacePrefix: string,
): ITemplatedPromptRegistration<IExplainThisCodeArgs> =>
	buildTemplatedPrompt({
		namespacePrefix,
		name: 'explain-this-code',
		description:
			'Explain a file or line range, grounded in refactor definition and references instead of guesses.',
		argsSchema: ExplainArgsSchema,
		arguments: [
			{
				name: 'file',
				description: 'Workspace-relative file path to explain.',
				required: true,
			},
			{
				name: 'startLine',
				description: 'Optional 1-based start line for a focused slice.',
				required: false,
			},
			{
				name: 'endLine',
				description: 'Optional 1-based end line for a focused slice.',
				required: false,
			},
		],
		template: ({ file, startLine, endLine }) => {
			const target = formatSelection(file, startLine, endLine);
			return [
				`Explain the code in ${target}.`,
				'',
				'Read the file or requested slice before commenting on it.',
				'Ground symbol ownership with `delendai_refactor_refactor_definition` and fan-in/fan-out with `delendai_refactor_refactor_references` before you summarize behavior.',
				'',
				'Cover these points:',
				'- What this code is responsible for.',
				'- The main control flow and important data transformations.',
				'- Inputs, outputs, side effects, and invariants.',
				'- Which collaborators or neighboring symbols matter most.',
				'- Edge cases, risks, and what to read next if the slice is incomplete.',
				'',
				'If part of the behavior lives outside the requested slice, say that explicitly instead of filling gaps from memory.',
			].join('\n');
		},
	});
