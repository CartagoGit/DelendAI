import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	emptyWorkflowContributions,
	type IAdoptionExtension,
	type IWorkflowContribution,
} from '../../../../src/lib/contracts';

describe('workflow contribution contracts', async () => {
	it('stay agnostic from domain-specific workflow implementations', async () => {
		const files = [
			'packages/core/src/lib/contracts/interfaces/workflow-contribution.interface.ts',
			'packages/core/src/lib/contracts/interfaces/adoption-extension.interface.ts',
			'packages/core/src/lib/contracts/index.ts',
		];
		for (const file of files) {
			const source = await readFile(join(process.cwd(), file), 'utf8');
			expect(source).not.toContain('@delendai/proposals');
			expect(source).not.toContain('IProposalSummary');
			expect(source).not.toContain('ProposalStatus');
			expect(source).not.toContain('proposalStatusCounts');
			expect(source).not.toContain('proposals/index.json');
			expect(source.toLowerCase()).not.toContain('proposal');
		}
	});

	it('accepts a provider contribution with summary, stable tools and next action', async () => {
		const contribution: IWorkflowContribution = {
			summary: {
				title: 'Core workflow snapshot',
				detail: 'Summarises provider-owned workflow data.',
				metrics: [{ label: 'activeItems', value: 3 }],
			},
			stableTools: [
				{
					id: 'workflow.inspect',
					title: 'Inspect workflow',
					detail: 'Returns a stable workflow snapshot.',
				},
			],
			recommendedNextAction: {
				title: 'Inspect the workflow queue',
				detail: 'Review the stable snapshot before taking action.',
				commands: ['bun run inspect:workflow'],
				files: ['docs/workflow.md'],
			},
		};

		expect(contribution.summary?.metrics?.[0]).toEqual({
			label: 'activeItems',
			value: 3,
		});
		expect(contribution.stableTools[0]?.id).toBe('workflow.inspect');
		expect(contribution.recommendedNextAction?.commands).toContain(
			'bun run inspect:workflow',
		);
	});

	it('accepts generic adoption steps with commands or files', async () => {
		const extension: IAdoptionExtension = {
			title: 'Workflow adoption',
			detail: 'Adds generic workflow setup guidance.',
			steps: [
				{
					title: 'Create the baseline config',
					detail: 'Write the initial configuration file.',
					files: ['config/workflow.json'],
				},
				{
					title: 'Run the bootstrap command',
					detail: 'Generate the first workflow artifacts.',
					command: 'bun run workflow:init',
				},
			],
		};

		expect(extension.steps).toHaveLength(2);
		expect(extension.steps[0]?.files).toContain('config/workflow.json');
		expect(extension.steps[1]?.command).toBe('bun run workflow:init');
	});

	it('returns a safe empty state when no provider contributes data', async () => {
		expect(() => emptyWorkflowContributions()).not.toThrow();

		const state = emptyWorkflowContributions();
		expect(state.summaries).toEqual([]);
		expect(state.stableTools).toEqual([]);
		expect(state.recommendedNextAction).toEqual({
			title: 'No workflow contributions available',
			detail: 'No provider reported workflow data.',
		});
	});
});
