import z from 'zod';

import {
	buildTemplatedPrompt,
	type ITemplatedPromptRegistration,
} from './shared';

const WriteTestsArgsSchema = z
	.object({
		file: z.string().min(1),
		style: z.enum(['unit', 'integration', 'all']).optional(),
	})
	.strict();

export type IWriteTestsForArgs = z.infer<typeof WriteTestsArgsSchema>;

export const buildWriteTestsForPrompt = (
	namespacePrefix: string,
): ITemplatedPromptRegistration<IWriteTestsForArgs> =>
	buildTemplatedPrompt({
		namespacePrefix,
		name: 'write-tests-for',
		description:
			'Write tests for a file while following the workspace test convention and spec placement rules.',
		argsSchema: WriteTestsArgsSchema,
		arguments: [
			{
				name: 'file',
				description:
					'Workspace-relative file path to cover with tests.',
				required: true,
			},
			{
				name: 'style',
				description: 'Requested test style: unit, integration, or all.',
				required: false,
			},
		],
		template: ({ file, style }) => {
			const requestedStyle = style ?? 'unit';
			return [
				`Write ${requestedStyle} tests for ${file}.`,
				'',
				'Load the workspace testing rules with `delendai_test-convention_get_convention` before drafting anything.',
				'Choose the spec path with `delendai_test-convention_suggest_spec_path` and validate the resulting layout with `delendai_test-convention_scan_drift` after the draft exists.',
				'',
				'Deliverables:',
				'- The target spec path and why it matches the convention.',
				'- A short test plan listing the behaviors or edge cases to cover.',
				'- The concrete test file content, following the workspace runner and mock style.',
				'- Any assumptions or seams that still need manual confirmation.',
				'',
				'Do not default to generic tests; follow the actual repo conventions and the requested style.',
			].join('\n');
		},
	});
