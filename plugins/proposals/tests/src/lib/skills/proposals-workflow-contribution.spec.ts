import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	assembleWorkflowContributions,
	resetWorkflowContributionRegistryForTests,
} from '@delendai/core/lib/cli/workflow-contribution-assembly';

import {
	buildProposalsWorkflowContribution,
	registerProposalsWorkflowContribution,
} from '@delendai/proposals/lib/skills/proposals-workflow-contribution';

describe('proposals workflow contribution', () => {
	beforeEach(() => {
		resetWorkflowContributionRegistryForTests();
	});

	afterEach(() => {
		resetWorkflowContributionRegistryForTests();
	});

	it('builds a workflow contribution from the proposals index and preserves the current recommended action', async () => {
		const contribution = await buildProposalsWorkflowContribution({
			workspaceRoot: '/workspace',
			cacheDir: '.cache',
			corePrefix: 'mcp-vertex',
			readWorkspaceFile: async (path) => {
				expect(path).toBe('/workspace/.cache/proposals/index.json');
				return JSON.stringify({
					proposals: [
						{
							id: 'r00043',
							title: 'Make workflow assembly agnostic',
							track: 'packages/core',
							status: 'in-progress',
							kind: 'refactor',
							date: '2026-08-30',
						},
						{
							id: 'x00263',
							title: 'Close peer review loop',
							track: 'plugins/proposals',
							status: 'done',
							kind: 'fix',
							date: '2026-08-29',
						},
					],
				});
			},
		});

		expect(contribution.proposalSummaries).toHaveLength(2);
		expect(contribution.summary).toEqual({
			title: 'Proposal workflow snapshot',
			detail: '2 proposals indexed; 1 actionable.',
			metrics: [
				{ label: 'totalProposals', value: 2 },
				{ label: 'actionableProposals', value: 1 },
			],
		});
		expect(contribution.recommendedNextAction?.detail).toBe(
			'Call mcp-vertex_overview, then mcp-vertex_proposals_auto_work to start working.',
		);
		expect(contribution.stableTools.length).toBeGreaterThan(0);
		expect(contribution.stableTools[0]?.id).toBe('proposal_transition');
	});

	it('registers into the generic workflow assembly and yields the same recommended action text', async () => {
		registerProposalsWorkflowContribution();

		const state = await assembleWorkflowContributions({
			workspaceRoot: '/workspace',
			cacheDir: '.cache',
			corePrefix: 'mcp-vertex',
			readWorkspaceFile: async () => undefined,
		});

		expect(state.proposalSummaries).toEqual([]);
		expect(state.recommendedNextActionText).toBe(
			'Call mcp-vertex_overview, then mcp-vertex_proposals_auto_work to start working.',
		);
		expect(state.summaries[0]?.detail).toBe(
			'No proposals are indexed yet.',
		);
	});
});
