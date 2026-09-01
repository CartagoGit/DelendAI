import type { IProposalSummary } from '@mcp-vertex/core/lib/catalog/agent-discovery-types';
import type { IWorkflowContribution } from '@mcp-vertex/core/lib/contracts';
import {
	registerWorkflowContribution,
	type IAssembleWorkflowContributionsInput,
} from '@mcp-vertex/core/lib/cli/workflow-contribution-assembly';
import { readProposalsIndex } from '@mcp-vertex/core/lib/cli/read-proposals-index';

import { PROPOSALS_STABLE_TOOLS } from '../api/proposals-stable-tools';

type TProposalWorkflowContribution = IWorkflowContribution & {
	readonly proposalSummaries: readonly IProposalSummary[];
};

const countActionableProposals = (
	proposalSummaries: readonly IProposalSummary[],
): number =>
	proposalSummaries.filter(
		(summary) =>
			summary.status === 'ready' ||
			summary.status === 'in-progress' ||
			summary.status === 'paused',
	).length;

export const buildProposalsWorkflowContribution = async (
	input: IAssembleWorkflowContributionsInput,
): Promise<TProposalWorkflowContribution> => {
	const proposalSummaries = await readProposalsIndex(
		input.workspaceRoot,
		input.cacheDir,
		input.readWorkspaceFile,
	);
	const actionableCount = countActionableProposals(proposalSummaries);
	return {
		summary: {
			title: 'Proposal workflow snapshot',
			detail:
				proposalSummaries.length === 0
					? 'No proposals are indexed yet.'
					: `${proposalSummaries.length} proposals indexed; ${actionableCount} actionable.`,
			metrics: [
				{ label: 'totalProposals', value: proposalSummaries.length },
				{ label: 'actionableProposals', value: actionableCount },
			],
		},
		stableTools: PROPOSALS_STABLE_TOOLS.map((descriptor) => ({
			id: descriptor.name,
			title: descriptor.name,
			detail: descriptor.summary ?? descriptor.name,
		})),
		recommendedNextAction: {
			title: 'Start proposal work',
			detail: `Call ${input.corePrefix}_overview, then ${input.corePrefix}_proposals_auto_work to start working.`,
			commands: [
				`${input.corePrefix}_overview`,
				`${input.corePrefix}_proposals_auto_work`,
			],
		},
		proposalSummaries,
	};
};

/** Register the proposals workflow contribution once the plugin loads. */
export const registerProposalsWorkflowContribution = (): void => {
	registerWorkflowContribution(
		'proposals',
		buildProposalsWorkflowContribution,
	);
};
