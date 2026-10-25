import z from 'zod';

import {
	buildTemplatedPrompt,
	type ITemplatedPromptRegistration,
} from './shared';

const ReviewDiffArgsSchema = z
	.object({
		base: z.string().min(1).optional(),
		head: z.string().min(1).optional(),
	})
	.strict();

export type IReviewThisDiffArgs = z.infer<typeof ReviewDiffArgsSchema>;

export const buildReviewThisDiffPrompt = (
	namespacePrefix: string,
): ITemplatedPromptRegistration<IReviewThisDiffArgs> =>
	buildTemplatedPrompt({
		namespacePrefix,
		name: 'review-this-diff',
		description:
			'Structure a diff review around shipped git, quality, and security signals.',
		argsSchema: ReviewDiffArgsSchema,
		arguments: [
			{
				name: 'base',
				description: 'Optional base ref for commit-range context.',
				required: false,
			},
			{
				name: 'head',
				description: 'Optional head ref for commit-range context.',
				required: false,
			},
		],
		template: ({ base, head }) => {
			const range =
				base !== undefined || head !== undefined
					? `${base ?? 'HEAD~1'}..${head ?? 'HEAD'}`
					: 'working-tree or staged diff';
			return [
				`Review the diff for ${range}.`,
				'',
				'Use `delendai_git_diff` to inspect the current diff shape when the changes are still local.',
				`Use \`delendai_git_changelog\` with range \`${range}\` when you need commit-set context and inferred release semantics.`,
				'Use `delendai_quality_quality_run_all` to gather gate failures before commenting on code quality.',
				'Use `delendai_security_security_audit` when the diff touches auth, inputs, shelling, filesystem writes, credentials, dependencies, or trust boundaries.',
				'',
				'Review format:',
				'- Findings first, ordered by severity.',
				'- Include file and function anchors when you can ground them.',
				'- Call out missing validation or tests explicitly.',
				'- If no issue is found, say that plainly and note residual risks or blind spots.',
				'',
				'Do not claim a gate passed unless the referenced tool output actually supports it.',
			].join('\n');
		},
	});
